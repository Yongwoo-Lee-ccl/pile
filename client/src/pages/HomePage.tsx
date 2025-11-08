import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
    AppBar, Toolbar, Typography, Container, Button, List, ListItem, ListItemText, IconButton, Paper, Box, Modal, TextField, ListItemButton
} from '@mui/material';
import { UploadFile, Delete, Edit } from '@mui/icons-material';

const API_URL = 'http://localhost:3001';

interface PDF {
    id: string;
    title: string;
    author: string;
}

const modalStyle = {
    position: 'absolute' as 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 400,
    bgcolor: 'background.paper',
    border: '2px solid #000',
    boxShadow: 24,
    p: 4,
};

export function HomePage() {
    const [pdfs, setPdfs] = useState<PDF[]>([]);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [currentEditPdf, setCurrentEditPdf] = useState<PDF | null>(null);
    const navigate = useNavigate();

    const fetchPdfs = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/pdfs`);
            setPdfs(response.data);
        } catch (error) {
            console.error('PDF 목록을 불러오는 데 실패했습니다.', error);
        }
    };

    useEffect(() => {
        fetchPdfs();
    }, []);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await axios.post(`${API_URL}/api/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            fetchPdfs();
        } catch (error) {
            console.error('파일 업로드에 실패했습니다.', error);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('정말로 이 PDF를 삭제하시겠습니까?')) {
            try {
                await axios.delete(`${API_URL}/api/pdfs/${id}`);
                fetchPdfs();
            } catch (error) {
                console.error('PDF 삭제에 실패했습니다.', error);
            }
        }
    };
    
    const handleEditSave = async () => {
        if (!currentEditPdf) return;
        try {
            await axios.put(`${API_URL}/api/pdfs/${currentEditPdf.id}`, {
                title: currentEditPdf.title,
                author: currentEditPdf.author,
            });
            fetchPdfs();
            setEditModalOpen(false);
            setCurrentEditPdf(null);
        } catch (error) {
            console.error('메타데이터 업데이트에 실패했습니다.', error);
        }
    };

    const openEditModal = (e: React.MouseEvent, pdf: PDF) => {
        e.stopPropagation();
        setCurrentEditPdf({ ...pdf });
        setEditModalOpen(true);
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        PDF-Pile
                    </Typography>
                    <Button
                        variant="contained"
                        component="label"
                        color="secondary"
                        startIcon={<UploadFile />}
                    >
                        Upload PDF
                        <input type="file" accept="application/pdf" hidden onChange={handleFileUpload} />
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="md" sx={{ mt: 4 }}>
                <Paper elevation={3}>
                    <List>
                        {pdfs.map((pdf) => (
                            <ListItem
                                key={pdf.id}
                                disablePadding
                                secondaryAction={
                                    <>
                                        <IconButton edge="end" aria-label="edit" onClick={(e) => openEditModal(e, pdf)}>
                                            <Edit />
                                        </IconButton>
                                        <IconButton edge="end" aria-label="delete" onClick={(e) => handleDelete(e, pdf.id)}>
                                            <Delete />
                                        </IconButton>
                                    </>
                                }
                            >
                                <ListItemButton onClick={() => navigate(`/pdf/${pdf.id}`)}>
                                    <ListItemText primary={pdf.title} secondary={pdf.author || '저자 정보 없음'} />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            </Container>
            
            <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)}>
                <Box sx={modalStyle}>
                    <Typography variant="h6" component="h2">메타데이터 수정</Typography>
                    {currentEditPdf && (
                        <Box component="form" sx={{ mt: 2 }}>
                            <TextField
                                fullWidth
                                label="제목"
                                value={currentEditPdf.title}
                                onChange={(e) => setCurrentEditPdf({ ...currentEditPdf, title: e.target.value })}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth
                                label="저자"
                                value={currentEditPdf.author}
                                onChange={(e) => setCurrentEditPdf({ ...currentEditPdf, author: e.target.value })}
                                sx={{ mb: 2 }}
                            />
                            <Button variant="contained" onClick={handleEditSave}>저장</Button>
                        </Box>
                    )}
                </Box>
            </Modal>
        </>
    );
}
