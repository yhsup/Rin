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
                .get("/github/callback", async ({ jwt, oauth2, set, cookie: { token, redirect_to } }) => {
                    
                    // ============= 部署验证断点 =============
                    // 只要看到这个报错，就证明“老代码”已被彻底替换。
                    throw new Error("DEPLOY_SUCCESS_CHECK"); 
                    // =======================================

                    const gh_token = await oauth2.authorize("GitHub");
                    const response = await fetch("https://api.github.com/user", {
                        headers: {
                            Authorization: `Bearer ${gh_token.accessToken}`,
                            Accept: "application/json",
                            "User-Agent": "elysia"
                        },
                    });
                    
                    const githubUser: any = await response.json();
                    const githubId = githubUser.id.toString();

                    const existingUser = await db.query.users.findFirst({ 
                        where: eq(users.openid, githubId) 
                    });

                    let finalUserId: number;

                    if (existingUser) {
                        // 使用强制断言访问 ID，因为 if(existingUser) 已经保证了其存在
                        finalUserId = existingUser.id;
                    } else {
                        const allUsers = await db.query.users.findMany();
                        if (allUsers && allUsers.length > 0) {
                            throw new Error('系统已锁定：仅允许管理员登录。');
                        }

                        const result = await db.insert(users)
                            .values({
                                openid: githubId,
                                username: githubUser.name || githubUser.login,
                                avatar: githubUser.avatar_url,
                                permission: 1 
                            })
                            .returning({ insertedId: users.id });

                        if (!result?.[0]?.insertedId) {
                            throw new Error('Failed to register: No ID returned');
                        }
                        finalUserId = result[0].insertedId;
                    }

                    token.set({
                        value: await jwt.sign({ id: finalUserId }),
                        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                        path: '/',
                    });

                    const redirect_host = redirect_to.value || ""
                    set.headers = { 'Content-Type': 'text/html' }
                    set.redirect = `${redirect_host}/callback?token=${token.value}`
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
                    const user = await db.query.users.findFirst({ where: eq(users.id, parseInt(uid)) })
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
