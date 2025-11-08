import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Core viewer
import { Viewer, Worker, SpecialZoomLevel, RenderHighlightsProps } from '@react-pdf-viewer/core';
// Plugins
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { SelectionMode, selectionModePlugin, OnTextSelection, SelectionRange } from '@react-pdf-viewer/selection-mode';

import {
    AppBar, Toolbar, IconButton, Typography, CssBaseline, Button, ButtonGroup, Tooltip, Box
} from '@mui/material';
import { ArrowBack, Save, BorderColor, FormatUnderlined, PanTool } from '@mui/icons-material';

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

    // --- 주석 생성 콜백 ---
    const handleTextSelection: OnTextSelection = useCallback((range: SelectionRange) => {
        if (annotationMode === 'none' || !currentPdf) return;

        const newAnnotation: Annotation = {
            id: uuidv4(),
            type: annotationMode,
            pageIndex: range.pageIndex,
            rects: range.rects,
        };

        const updatedAnnotations = [...currentPdf.annotations, newAnnotation];
        setCurrentPdf({ ...currentPdf, annotations: updatedAnnotations });
    }, [annotationMode, currentPdf]);

    // --- 뷰어 플러그인 설정 (useMemo 사용) ---
    const defaultLayoutPluginInstance = useMemo(() => defaultLayoutPlugin(), []);

    const selectionModePluginInstance = useMemo(
        () =>
            selectionModePlugin({
                onTextSelection: handleTextSelection,
                selectionMode: annotationMode !== 'none' ? SelectionMode.Text : SelectionMode.Hand,
            }),
        [annotationMode, handleTextSelection]
    );

    const highlightPlugin = useMemo(() => {
        if (!currentPdf) return { render: () => <></> };
        
        const renderAnnotation = (type: 'highlight' | 'underline', props: RenderHighlightsProps) => {
            const getStyle = (rect: Rect) => ({
                left: `${rect.x}%`,
                top: `${rect.y}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
                position: 'absolute' as const,
                pointerEvents: 'none' as const,
                ...(type === 'highlight'
                    ? { backgroundColor: 'rgba(255, 255, 0, 0.3)' }
                    : { borderBottom: '2px solid rgba(255, 0, 0, 0.7)' }),
            });

            return (
                <>
                    {props.highlights.map((area, i) => (
                        <div key={i} style={getStyle(area.rect)} />
                    ))}
                </>
            );
        };

        const highlights = currentPdf.annotations.filter(a => a.type === 'highlight');
        const underlinings = currentPdf.annotations.filter(a => a.type === 'underline');

        return {
            render: (props: RenderHighlightsProps) => (
                <>
                    {renderAnnotation('highlight', { ...props, highlights: highlights.filter(h => h.pageIndex === props.pageIndex) })}
                    {renderAnnotation('underline', { ...props, highlights: underlinings.filter(u => u.pageIndex === props.pageIndex) })}
                </>
            ),
        };
    }, [currentPdf]);

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

    if (!currentPdf) {
        return <Typography sx={{ p: 4 }}>Loading PDF...</Typography>;
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <CssBaseline />
            <AppBar position="static">
                <Toolbar>
                    <IconButton color="inherit" onClick={() => navigate('/')} edge="start" sx={{ mr: 2 }}><ArrowBack /></IconButton>
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>{currentPdf.title}</Typography>
                    
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
                        <Viewer
                            fileUrl={`${API_URL}${currentPdf.path}`}
                            plugins={[defaultLayoutPluginInstance, selectionModePluginInstance, highlightPlugin]}
                            defaultScale={SpecialZoomLevel.PageFit}
                        />
                    </Worker>
                ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <Typography>Loading document...</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
