import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Env } from "../db/db";
import { getEnv } from "./di";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";  // 导入生成预签名 URL 的方法

export function createS3Client() {
    const env: Env = getEnv();
    const region = env.S3_REGION;
    const endpoint = env.S3_ENDPOINT;
    const accessKeyId = env.S3_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
    const forcePathStyle = env.S3_FORCE_PATH_STYLE === "true";

    const client = new S3Client({
        region: region,
        endpoint: endpoint,
        forcePathStyle: forcePathStyle,
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey
        },
    });

    return client;
}

// 新增：生成预签名 URL
export async function generatePresignedUrl(objectKey: string, expirationInSeconds: number) {
    const client = createS3Client();

    const params = {
        Bucket: process.env.S3_BUCKET_NAME, // 你的 bucket 名称
        Key: objectKey,                     // 对象的路径
    };

    const command = new GetObjectCommand(params);

    try {
        // 生成预签名 URL，设置有效期（单位：秒）
        const presignedUrl = await getSignedUrl(client, command, { expiresIn: expirationInSeconds });
        return presignedUrl;
    } catch (error) {
        console.error("Error generating presigned URL:", error);
        throw new Error("Failed to generate presigned URL");
    }
}

