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
            // 在 callback 开始处临时加入
                .get("/github/callback", async ({ jwt, oauth2, set, cookie: { token, redirect_to } }) => {
                    // 临时测试代码：部署后登录，如果页面直接显示这个报错，说明新代码生效了
                    // throw new Error("VERIFY_NEW_CODE_ACTIVE");
                .get("/github/callback", async ({ jwt, oauth2, set, cookie: { token, redirect_to } }) => {
                    // 注意：这里删除了未使用过的 store, query, state

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
                        finalUserId = existingUser.id;
                    } else {
                        const allUsers = await db.query.users.findMany();
                        if (allUsers && allUsers.length > 0) {
                            throw new Error('系统已锁定：仅允许管理员登录，禁止新账号注册。');
                        }

                        const newProfile = {
                            openid: githubId,
                            username: githubUser.name || githubUser.login,
                            avatar: githubUser.avatar_url,
                            permission: 1 
                        };
                        
                        const result = await db.insert(users)
                            .values(newProfile)
                            .returning({ insertedId: users.id });

                        if (!result || result.length === 0) {
                            throw new Error('Failed to register');
                        }
                        finalUserId = result[0].insertedId;
                    }

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
