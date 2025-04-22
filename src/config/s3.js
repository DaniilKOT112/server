const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
})

const s3 = new S3Client({
    region: 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
        accessKeyId: process.env.YC_KEY_ID,
        secretAccessKey: process.env.YC_SECRET_KEY,
    },
    forcePathStyle: true
})

const uploadToS3 = async (file) => {
    const params = {
        Bucket: 'daniilkot112',
        Key: Date.now() + '_' + file.originalname,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
    };

    try {
        const parallelUploads3 = new Upload({
            client: s3,
            params: params,
        })

        const result = await parallelUploads3.done();
        return result.Location;
    } catch (err) {
        throw new Error('Ошибка загрузки файла: ' + err.message);
    }
}

const deleteFromS3 = async (fileUrl) => {
    if (!fileUrl || !fileUrl.includes('storage.yandexcloud.net')) {
        return
    };

    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/').filter(part => part !== '');

    if (pathParts.length < 2) {
        throw new Error('Неверный url');
    };

    const bucketName = pathParts[0];
    const key = pathParts.slice(1).join('/');
    const decodedKey = decodeURIComponent(key);

    const params = {
        Bucket: bucketName,
        Key: decodedKey
    };

    try {
        await s3.send(new DeleteObjectCommand(params));
        console.log('Файл удален', decodedKey);
    } catch (err) {
        console.error('Ошибка удаления', err);
        throw err;
    }
}

module.exports = { uploadToS3, deleteFromS3 };