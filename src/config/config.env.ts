export default () => ({
  port: parseInt(process.env.PORT!, 10) || 4000,
  node_env: process.env.NODE_ENV || 'development',
  MONGO_URL: process.env.MONGO_URL,
  path_public_key: process.env.PATH_PUBLIC_KEY || '',
  path_private_key: process.env.PATH_PRIVATE_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '',
  amazon3s: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    bucketName: process.env.AWS_S3_BUCKET_NAME || '',
    bucketRegion: process.env.AWS_S3_BUCKET_REGION || '',
  },
  FIREBASE_CONFIG_BASE64: process.env.FIREBASE_CONFIG_BASE64 || '',
  GMAIL_USER: process.env.GMAIL_USER || '',
  GMAIL_PASSWORD: process.env.GMAIL_PASSWORD || '',
  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT!, 10) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  },
});
export const PORT = 'port';
export const NODE_ENV = 'node_env';
export const MONGO_URL = 'MONGO_URL';
export const PATH_PUBLIC_KEY = 'path_public_key';
export const PATH_PRIVATE_KEY = 'path_private_key';
export const JWT_SECRET = 'JWT_SECRET';
export const JWT_EXPIRES_IN = 'JWT_EXPIRES_IN';

export const AMAZON_S3_ACCESS_KEY_ID = 'amazon3s.accessKeyId';
export const AWS_SECRET_ACCESS_KEY = 'amazon3s.secretAccessKey';
export const AWS_S3_BUCKET_NAME = 'amazon3s.bucketName';
export const AWS_S3_BUCKET_REGION = 'amazon3s.bucketRegion';
export const FIREBASE_CONFIG_BASE64 = 'FIREBASE_CONFIG_BASE64';
export const GMAIL_USER = 'GMAIL_USER';
export const GMAIL_PASSWORD = 'GMAIL_PASSWORD';



export const MAIL_HOST = 'mail.host';
export const MAIL_PORT = 'mail.port';
export const MAIL_SECURE = 'mail.secure';
export const MAIL_USER = 'mail.auth.user';
export const MAIL_PASS = 'mail.auth.pass';