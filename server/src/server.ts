import cors from '@elysiajs/cors';
import { serverTiming } from '@elysiajs/server-timing';
import { Elysia } from 'elysia';
import { AIConfigService } from './services/ai-config';
import { CommentService } from './services/comments';
import { FaviconService } from "./services/favicon";
import { FeedService } from './services/feed';
import { FriendService } from './services/friends';
import { MomentsService } from './services/moments';
import { RSSService } from './services/rss';
import { SEOService } from './services/seo';
import { StorageService } from './services/storage';
import { TagService } from './services/tag';
import { UserService } from './services/user';
import { ConfigService } from './services/config';

export const app = () => new Elysia({ aot: false })
    .use(cors({
        aot: false,
        origin: '*',  // 这里允许所有来源，你可以根据需要更改
        methods: '*',
        allowedHeaders: [
            'authorization',
            'content-type'
        ],
        maxAge: 600,
        credentials: true,
        preflight: true
    }))
    .use(serverTiming({
        enabled: true,
    }))
    .use(UserService())
    .use(FaviconService())
    .use(FeedService())
    .use(CommentService())
    .use(TagService())
    .use(StorageService())  // 确保 StorageService 被添加到应用中
    .use(FriendService())
    .use(SEOService())
    .use(RSSService())
    .use(ConfigService())
    .use(AIConfigService())
    .use(MomentsService())
    .get('/', () => `Hi`)

    // 新增生成预签名 URL 的路由
    .get('/storage/generate-presigned-url', async (context) => {
        const { objectKey } = context.query;  // 从查询参数获取 objectKey
        if (!objectKey) {
            return context.json({ error: 'objectKey is required' }, 400);
        }

        const storageService: StorageService = context.container.get('storageService');  // 从容器中获取 StorageService
        try {
            // 生成预签名 URL，有效期为 1 小时（3600秒）
            const presignedUrl = await storageService.generatePresignedUrl(objectKey, 3600);
            return context.json({ url: presignedUrl });
        } catch (error) {
            return context.json({ error: 'Failed to generate presigned URL' }, 500);
        }
    })

    .onError(({ path, params, code }) => {
        if (code === 'NOT_FOUND') return `${path} ${JSON.stringify(params)} not found`;
    });

export type App = ReturnType<typeof app>;
