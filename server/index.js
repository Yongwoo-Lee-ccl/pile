const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// --- 기본 설정 ---
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DB_PATH = path.join(__dirname, 'db.json');

// uploads 디렉토리 및 db.json 파일 초기화
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ pdfs: [] }, null, 2));
}

// --- 데이터베이스 헬퍼 ---
const readDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// --- Multer 설정 (파일 업로드) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // 파일명 중복을 피하기 위해 고유한 파일명 생성
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});
const upload = multer({ storage: storage });

// --- 정적 파일 서빙 ---
// /files/<filename> 경로로 uploads 폴더의 파일에 접근 가능
app.use('/files', express.static(UPLOADS_DIR));

// --- API 엔드포인트 ---

// 1. 특정 PDF 정보 가져오기
app.get('/api/pdfs/:id', (req, res) => {
    const { id } = req.params;
    const db = readDB();
    const pdf = db.pdfs.find(p => p.id === id);
    if (pdf) {
        res.json(pdf);
    } else {
        res.status(404).send('PDF를 찾을 수 없습니다.');
    }
});

// 2. 모든 PDF 정보 가져오기
app.get('/api/pdfs', (req, res) => {
    const db = readDB();
    res.json(db.pdfs);
});

// 2. PDF 업로드
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('파일이 업로드되지 않았습니다.');
    }

    const db = readDB();
    const newPdf = {
        id: crypto.randomUUID(),
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/files/${req.file.filename}`,
        title: req.file.originalname.replace(/\.pdf$/i, ''),
        author: '',
        journal: '',
        annotations: [],
        createdAt: new Date().toISOString(),
    };

    db.pdfs.push(newPdf);
    writeDB(db);

    res.status(201).json(newPdf);
});

// 3. PDF 삭제
app.delete('/api/pdfs/:id', (req, res) => {
    const { id } = req.params;
    const db = readDB();
    
    const pdfIndex = db.pdfs.findIndex(p => p.id === id);
    if (pdfIndex === -1) {
        return res.status(404).send('PDF를 찾을 수 없습니다.');
    }

    const [deletedPdf] = db.pdfs.splice(pdfIndex, 1);
    writeDB(db);

    // 실제 파일 삭제
    const filePath = path.join(UPLOADS_DIR, deletedPdf.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    res.status(200).json({ message: 'PDF가 삭제되었습니다.' });
});

// 4. PDF 메타데이터 및 주석 수정
app.put('/api/pdfs/:id', (req, res) => {
    const { id } = req.params;
    const { title, author, journal, annotations } = req.body;
    const db = readDB();

    const pdfIndex = db.pdfs.findIndex(p => p.id === id);
    if (pdfIndex === -1) {
        return res.status(404).send('PDF를 찾을 수 없습니다.');
    }

    // 필요한 정보만 업데이트
    db.pdfs[pdfIndex] = {
        ...db.pdfs[pdfIndex],
        title: title ?? db.pdfs[pdfIndex].title,
        author: author ?? db.pdfs[pdfIndex].author,
        journal: journal ?? db.pdfs[pdfIndex].journal,
        annotations: annotations ?? db.pdfs[pdfIndex].annotations,
    };
    writeDB(db);

    res.status(200).json(db.pdfs[pdfIndex]);
});


// --- 서버 시작 ---
app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
