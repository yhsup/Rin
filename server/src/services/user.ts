import { eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { URL } from "url";
import type { DB } from "../_worker";
import { users } from "../db/schema";
import { setup } from "../setup";
import { getDB } from "../utils/di";

export function UserService() {
    const db: DB = getDB();
    return new Elysia({ aot: false })
        .use(setup())
        .group('/user', (group) =>
            group
                .get("/github", ({ oauth2, headers: { referer }, cookie: { redirect_to } }) => {
                    if (!referer) {
                        return 'Referer not found'
                    }
                    const referer_url = new URL(referer)
                    redirect_to.value = `${referer_url.protocol}//${referer_url.host}`
                    return oauth2.redirect("GitHub", { scopes: ["read:user"] })
                })
                .get("/github/callback", async ({ jwt, oauth2, set, store, query, cookie: { token, redirect_to, state } }) => {

                    const gh_token = await oauth2.authorize("GitHub");
                    
                    // 获取 GitHub 用户原始数据
                    const response = await fetch("https://api.github.com/user", {
                        headers: {
                            Authorization: `Bearer ${gh_token.accessToken}`,
                            Accept: "application/json",
                            "User-Agent": "elysia"
                        },
                    });
                    
                    const githubUser: any = await response.json();
                    const githubId = githubUser.id.toString();

                    // 1. 查找数据库中是否存在该 openid 的用户
                    const existingUser = await db.query.users.findFirst({ 
                        where: eq(users.openid, githubId) 
                    });

                    let finalUserId: number;

                    if (existingUser) {
                        // 【绝对保护】：老用户登录直接跳过数据库写入，保持数据库现有资料不变
                        finalUserId = existingUser.id;
                    } else {
                        // 【仅新用户】：第一次登录时初始化资料
                        const newProfile = {
                            openid: githubId,
                            username: githubUser.name || githubUser.login,
                            avatar: githubUser.avatar_url,
                            permission: 0
                        };

                        // 检查是否为系统第一个用户
                        if (!await store.anyUser(db)) {
                            const realTimeCheck = (await db.query.users.findMany())?.length > 0
                            if (!realTimeCheck) {
                                newProfile.permission = 1
                                store.anyUser = async (_: DB) => true
                            }
                        }
                        
                        const result = await db.insert(users)
                            .values(newProfile)
                            .returning({ insertedId: users.id });

                        if (!result || result.length === 0) {
                            throw new Error('Failed to register');
                        }
                        finalUserId = result[0].insertedId;
                    }

                    // 2. 统一根据用户 ID 签发 JWT
                    token.set({
                        value: await jwt.sign({ id: finalUserId }),
                        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                        path: '/',
                    });

                    const redirect_host = redirect_to.value || ""
                    const redirect_url = (`${redirect_host}/callback?token=${token.value}`);
                    set.headers = {
                        'Content-Type': 'text/html',
                    }
                    set.redirect = redirect_url
                }, {
                    query: t.Object({
                        state: t.String(),
                        code: t.String(),
                    })
                })
                .get('/profile', async ({ set, uid }) => {
                    if (!uid) {
                        set.status = 403
                        return 'Permission denied'
                    }
                    const uid_num = parseInt(uid)
                    const user = await db.query.users.findFirst({ where: eq(users.id, uid_num) })
                    if (!user) {
                        set.status = 404
                        return 'User not found'
                    }
                    return {
                        id: user.id,
                        username: user.username,
                        avatar: user.avatar,
                        permission: user.permission === 1,
                        createdAt: user.createdAt,
                        updatedAt: user.updatedAt,
                    }
                })
        )
}
