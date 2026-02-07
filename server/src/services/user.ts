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
                .get("/github/callback", async ({ jwt, oauth2, set, store, query, cookie: { token, redirect_to } }) => {

                    const gh_token = await oauth2.authorize("GitHub");
                    const response = await fetch("https://api.github.com/user", {
                        headers: {
                            Authorization: `Bearer ${gh_token.accessToken}`,
                            Accept: "application/json",
                            "User-Agent": "elysia"
                        },
                    });
                    
                    const gh_user: any = await response.json();
                    const openid = gh_user.id.toString();

                    // 1. 查找库中是否已经存在唯一的管理员
                    const existingUser = await db.query.users.findFirst();

                    if (existingUser) {
                        // 如果用户存在，校验 OpenID 是否匹配
                        if (existingUser.openid !== openid) {
                            set.status = 403;
                            return '系统已锁定：仅允许管理员登录。';
                        }
                        
                        // 匹配成功，签发 Token（不执行 update，保护手动修改的 SQL 数据）
                        token.set({
                            value: await jwt.sign({ id: existingUser.id }),
                            expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                            path: '/',
                        });
                    } else {
                        // 2. 如果库里一个用户都没有，才允许创建第一个账户
                        const profile = {
                            openid: openid,
                            username: gh_user.name || gh_user.login,
                            avatar: gh_user.avatar_url,
                            permission: 1 // 第一个用户设为管理员
                        };

                        const result = await db.insert(users).values(profile).returning({ insertedId: users.id });
                        
                        if (!result || result.length === 0) {
                            throw new Error('Failed to register');
                        }

                        token.set({
                            value: await jwt.sign({ id: result[0].insertedId }),
                            expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                            path: '/',
                        });
                    }

                    const redirect_host = redirect_to.value || "";
                    set.redirect = `${redirect_host}/callback?token=${token.value}`;
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
