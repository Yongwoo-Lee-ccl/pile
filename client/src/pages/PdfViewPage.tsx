import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Core viewer
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
// Plugins
import { SelectionMode, selectionModePlugin } from '@react-pdf-viewer/selection-mode';

import {
    AppBar,
    Toolbar,
    IconButton,
    Typography,
    CssBaseline,
    Button,
    ButtonGroup,
    Tooltip,
    Box,
    Paper,
    TextField,
    Stack,
} from '@mui/material';
import { ArrowBack, Save, BorderColor, FormatUnderlined, PanTool, StickyNote2 } from '@mui/icons-material';

const API_URL = 'http://localhost:3001';

// --- 타입 정의 ---
interface Rect {
    x: number; y: number; width: number; height: number;
}
interface Annotation {
    id: string;
    type: 'highlight' | 'underline';
    pageIndex: number;
    rects: Rect[];
    note?: string;
}
interface PDF {
    id:string;
    title: string;
    path: string;
    annotations: Annotation[];
}
type AnnotationMode = 'highlight' | 'underline' | 'none';

export function PdfViewPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    const [currentPdf, setCurrentPdf] = useState<PDF | null>(null);
    const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('none');
    const [message, setMessage] = useState('');
    const handSelectionHandlerRef = useRef<(() => void) | null>(null);
    const textSelectionHandlerRef = useRef<(() => void) | null>(null);
    const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
    const popupRef = useRef<HTMLDivElement | null>(null);

    // --- 데이터 로딩 ---
    useEffect(() => {
        const fetchPdfData = async () => {
            try {
                const response = await axios.get<PDF>(`${API_URL}/api/pdfs/${id}`);
                setCurrentPdf(response.data);
            } catch (error) {
                console.error('PDF 정보를 불러오는 데 실패했습니다.', error);
                navigate('/');
            }
        };
        fetchPdfData();
    }, [id, navigate]);

    // --- 주석 저장 ---
    const handleSaveAnnotations = async () => {
        if (!currentPdf) return;
        try {
            await axios.put(`${API_URL}/api/pdfs/${currentPdf.id}`, currentPdf);
            setMessage('주석이 저장되었습니다.');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error('주석 저장에 실패했습니다.', error);
            setMessage('주석 저장 실패!');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    // --- 뷰어 플러그인 설정 ---
    const selectionModePluginInstance = selectionModePlugin({
        selectionMode: SelectionMode.Hand,
    });
    const { SwitchSelectionMode } = selectionModePluginInstance;

    // --- 텍스트 선택 감지 ---
    const persistSelection = useCallback(() => {
        if (annotationMode === 'none') return;

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const anchorNode = selection.anchorNode;
        const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
        if (!anchorElement?.closest('.rpv-core__text-layer')) return;

        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (!range) return;
        const text = range.toString().trim();
        if (!text) return;

        const clientRects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        if (clientRects.length === 0) return;

        const pageLayers = Array.from(document.querySelectorAll<HTMLElement>('.rpv-core__page-layer'))
            .map((layer, fallbackIndex) => {
                const testId = layer.getAttribute('data-testid');
                const match = testId?.match(/core__page-layer-(\d+)/);
                const pageIndex = match ? parseInt(match[1], 10) : fallbackIndex;
                return {
                    rect: layer.getBoundingClientRect(),
                    pageIndex,
                };
            });
        if (pageLayers.length === 0) return;

        const groupedRects: Record<number, Rect[]> = {};

        clientRects.forEach(rect => {
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const targetPage = pageLayers.find(page =>
                centerX >= page.rect.left &&
                centerX <= page.rect.right &&
                centerY >= page.rect.top &&
                centerY <= page.rect.bottom
            );
            if (!targetPage) return;

            const relativeRect: Rect = {
                x: ((rect.left - targetPage.rect.left) / targetPage.rect.width) * 100,
                y: ((rect.top - targetPage.rect.top) / targetPage.rect.height) * 100,
                width: (rect.width / targetPage.rect.width) * 100,
                height: (rect.height / targetPage.rect.height) * 100,
            };

            if (!groupedRects[targetPage.pageIndex]) {
                groupedRects[targetPage.pageIndex] = [];
            }
            groupedRects[targetPage.pageIndex].push(relativeRect);
        });

        const newAnnotations = Object.entries(groupedRects).map(([pageIndex, rects]) => ({
            id: uuidv4(),
            type: annotationMode,
            pageIndex: parseInt(pageIndex, 10),
            rects,
        }));

        if (newAnnotations.length === 0) return;

        selection.removeAllRanges();

        setCurrentPdf(prev => (!prev ? prev : ({
            ...prev,
            annotations: [...prev.annotations, ...newAnnotations],
        })));

        // Return to hand mode so highlights are immediately clickable
        setAnnotationMode('none');
    }, [annotationMode]);

    const openAnnotationPopup = useCallback(
        (annotationId: string, anchorRect: DOMRect) => {
            const annotation = currentPdf?.annotations.find((a) => a.id === annotationId);
            setActiveAnnotationId(annotationId);
            setNoteDraft(annotation?.note ?? '');
            setPopupPosition({ x: anchorRect.left + anchorRect.width / 2, y: anchorRect.bottom + 8 });
        },
        [currentPdf]
    );

    const closeAnnotationPopup = useCallback(() => {
        setActiveAnnotationId(null);
        setPopupPosition(null);
        setNoteDraft('');
    }, []);

    const handleSaveNote = useCallback(() => {
        if (!currentPdf || !activeAnnotationId) return;
        setCurrentPdf({
            ...currentPdf,
            annotations: currentPdf.annotations.map((annotation) =>
                annotation.id === activeAnnotationId ? { ...annotation, note: noteDraft.trim() || undefined } : annotation
            ),
        });
        closeAnnotationPopup();
    }, [activeAnnotationId, closeAnnotationPopup, currentPdf, noteDraft]);

    const handleDeleteAnnotation = useCallback(() => {
        if (!currentPdf || !activeAnnotationId) return;
        setCurrentPdf({
            ...currentPdf,
            annotations: currentPdf.annotations.filter((annotation) => annotation.id !== activeAnnotationId),
        });
        closeAnnotationPopup();
    }, [activeAnnotationId, closeAnnotationPopup, currentPdf]);

    useEffect(() => {
        if (!activeAnnotationId) return;
        const handleOutsideClick = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                closeAnnotationPopup();
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [activeAnnotationId, closeAnnotationPopup]);

    const annotationsPlugin = useMemo(() => {
        const HighlightLayer: React.FC<{ pageIndex: number }> = ({ pageIndex }) => {
            if (!currentPdf) return null;
            const pageAnnotations = currentPdf.annotations.filter((a) => a.pageIndex === pageIndex);
            if (!pageAnnotations.length) return null;

            return (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: annotationMode === 'none' ? 'auto' : 'none',
                        zIndex: 5,
                    }}
                >
                    {pageAnnotations.flatMap((annotation) => {
                        const highlightElements = annotation.rects.map((rect, idx) => (
                            <button
                                key={`${annotation.id}-${idx}`}
                                type="button"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openAnnotationPopup(annotation.id, event.currentTarget.getBoundingClientRect());
                                }}
                                style={{
                                    position: 'absolute',
                                    left: `${rect.x}%`,
                                    top: `${rect.y}%`,
                                    width: `${rect.width}%`,
                                    height: `${rect.height}%`,
                                    backgroundColor:
                                        annotation.type === 'highlight'
                                            ? 'rgba(255, 255, 0, 0.35)'
                                            : 'transparent',
                                    border: 'none',
                                    borderBottom:
                                        annotation.type === 'underline'
                                            ? '2px solid rgba(255, 0, 0, 0.7)'
                                            : 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    pointerEvents: 'auto',
                                }}
                            />
                        ));

                        if (annotation.note && annotation.rects.length > 0) {
                            const noteRect = annotation.rects[0];
                            highlightElements.push(
                                <button
                                    key={`${annotation.id}-note-indicator`}
                                    type="button"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        openAnnotationPopup(annotation.id, event.currentTarget.getBoundingClientRect());
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: `calc(${noteRect.x}% + 4px)`,
                                        top: `calc(${noteRect.y}% - 20px)`,
                                        backgroundColor: '#fff8dc',
                                        border: '1px solid rgba(0,0,0,0.2)',
                                        borderRadius: 4,
                                        padding: 2,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        pointerEvents: 'auto',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                                    }}
                                    title="View note"
                                >
                                    <StickyNote2 fontSize="small" htmlColor="#b98900" />
                                </button>
                            );
                        }

                        return highlightElements;
                    })}
                </div>
            );
        };

        return {
            renderPageLayer: ({ pageIndex }: { pageIndex: number }) => (
                <HighlightLayer key={`annotation-layer-${pageIndex}`} pageIndex={pageIndex} />
            ),
        };
    }, [annotationMode, currentPdf, openAnnotationPopup]);

    // --- 키보드 단축키 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'h') setAnnotationMode('highlight');
            else if (e.key === 'u') setAnnotationMode('underline');
            else if (e.key === '0') setAnnotationMode('none');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // --- 텍스트 선택 저장 ---
    useEffect(() => {
        document.addEventListener('mouseup', persistSelection);
        return () => document.removeEventListener('mouseup', persistSelection);
    }, [persistSelection]);

    // --- 뷰어 선택 모드 동기화 ---
    useEffect(() => {
        if (annotationMode === 'none') {
            handSelectionHandlerRef.current?.();
        } else {
            textSelectionHandlerRef.current?.();
        }
    }, [annotationMode]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <CssBaseline />
            <AppBar position="static">
                <Toolbar>
                    <IconButton color="inherit" onClick={() => navigate('/')} edge="start" sx={{ mr: 2 }}><ArrowBack /></IconButton>
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>{currentPdf?.title ?? ''}</Typography>
                    
                    <ButtonGroup variant="contained" aria-label="annotation modes" sx={{ mr: 2 }}>
                        <Tooltip title="일반 모드 (0)"><Button onClick={() => setAnnotationMode('none')} color={annotationMode === 'none' ? 'secondary' : 'primary'}><PanTool /></Button></Tooltip>
                        <Tooltip title="하이라이트 (h)"><Button onClick={() => setAnnotationMode('highlight')} color={annotationMode === 'highlight' ? 'secondary' : 'primary'}><BorderColor /></Button></Tooltip>
                        <Tooltip title="밑줄 (u)"><Button onClick={() => setAnnotationMode('underline')} color={annotationMode === 'underline' ? 'secondary' : 'primary'}><FormatUnderlined /></Button></Tooltip>
                    </ButtonGroup>
                    
                    <Button color="secondary" variant="contained" startIcon={<Save />} onClick={handleSaveAnnotations}>Save</Button>
                    {message && <Typography sx={{ ml: 2, color: 'yellow' }}>{message}</Typography>}
                </Toolbar>
            </AppBar>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {currentPdf ? (
                    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.0.279/build/pdf.worker.min.js">
                        <>
                            <Viewer
                                fileUrl={`${API_URL}${currentPdf.path}`}
                                plugins={[selectionModePluginInstance, annotationsPlugin]}
                                defaultScale={SpecialZoomLevel.PageWidth}
                            />
                            <SwitchSelectionMode mode={SelectionMode.Hand}>
                                {({ onClick }) => {
                                    handSelectionHandlerRef.current = onClick;
                                    return null;
                                }}
                            </SwitchSelectionMode>
                            <SwitchSelectionMode mode={SelectionMode.Text}>
                                {({ onClick }) => {
                                    textSelectionHandlerRef.current = onClick;
                                    return null;
                                }}
                            </SwitchSelectionMode>
                        </>
                    </Worker>
                ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <Typography>Loading document...</Typography>
                    </Box>
                )}
            </Box>
            {activeAnnotationId && popupPosition && (
                <Box
                    ref={popupRef}
                    component={Paper}
                    elevation={3}
                    sx={{
                        position: 'fixed',
                        top: popupPosition.y,
                        left: popupPosition.x,
                        transform: 'translate(-50%, 0)',
                        zIndex: 1500,
                        p: 2,
                        minWidth: 240,
                    }}
                >
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle2">Annotation Note</Typography>
                        <TextField
                            multiline
                            minRows={3}
                            size="small"
                            value={noteDraft}
                            onChange={(event) => setNoteDraft(event.target.value)}
                            placeholder="Add a note..."
                        />
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button variant="outlined" color="error" onClick={handleDeleteAnnotation}>
                                Delete
                            </Button>
                            <Button variant="contained" onClick={handleSaveNote}>
                                Save
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            )}
        </Box>
    );
}
