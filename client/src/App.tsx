import { useEffect, useRef, useState, useContext } from 'react'
import { Helmet } from 'react-helmet'
import { getCookie } from 'typescript-cookie'
import { DefaultParams, PathPattern, Route, Switch } from 'wouter'
import Footer from './components/footer'
import { Header } from './components/header'
import { Padding } from './components/padding'
import useTableOfContents from './hooks/useTableOfContents.tsx'
import { client } from './main'
import { CallbackPage } from './page/callback'
import { FeedPage, TOCHeader } from './page/feed'
import { FeedsPage } from './page/feeds'
import { FriendsPage } from './page/friends'
import { HashtagPage } from './page/hashtag.tsx'
import { HashtagsPage } from './page/hashtags.tsx'
import { Settings } from "./page/settings.tsx"
import { TimelinePage } from './page/timeline'
import { WritingPage } from './page/writing'
import { ClientConfigContext, ConfigWrapper, defaultClientConfig } from './state/config.tsx'
import { Profile, ProfileContext } from './state/profile'
import { headersWithAuth } from './utils/auth'
import { tryInt } from './utils/int'
import { SearchPage } from './page/search.tsx'
import { Tips, TipsPage } from './components/tips.tsx'
import { useTranslation } from 'react-i18next'
import { MomentsPage } from './page/moments'
import { ErrorPage } from './page/error.tsx'

function App() {
  const ref = useRef(false)
  const { t } = useTranslation()
  const [profile, setProfile] = useState<Profile | undefined>()
  const [config, setConfig] = useState<ConfigWrapper>(new ConfigWrapper({}, new Map()))

  useEffect(() => {
    // --- 1. 自动缩放逻辑 ---
    const HIGH_RES_THRESHOLD = 2560;
    const applyScaling = () => {
      if (window.screen.width >= HIGH_RES_THRESHOLD) {
        document.documentElement.style.fontSize = '125%';
      } else {
        document.documentElement.style.fontSize = '100%';
      }
    };
    applyScaling();

    // --- 2. 图片安全防护逻辑 ---
    const handleContextMenu = (e: MouseEvent) => {
      // 拦截所有 <img> 标签的右键菜单
      if ((e.target as HTMLElement).tagName === 'IMG') {
        e.preventDefault();
      }
    };

    const handleDragStart = (e: DragEvent) => {
      // 禁止 <img> 标签被鼠标拖拽
      if ((e.target as HTMLElement).tagName === 'IMG') {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('dragstart', handleDragStart);

    // --- 3. 原有业务逻辑 (Profile & Config) ---
    if (!ref.current) {
      if ((getCookie('token')?.length ?? 0) > 0) {
        client.user.profile.get({
          headers: headersWithAuth()
        }).then(({ data }) => {
          if (data && typeof data !== 'string') {
            setProfile({
              id: data.id,
              avatar: data.avatar || '',
              permission: data.permission,
              name: data.username
            })
          }
        })
      }
      
      const savedConfig = sessionStorage.getItem('config')
      if (savedConfig) {
        const configObj = JSON.parse(savedConfig)
        const configWrapper = new ConfigWrapper(configObj, defaultClientConfig)
        setConfig(configWrapper)
      } else {
        client.config({ type: "client" }).get().then(({ data }) => {
          if (data && typeof data !== 'string') {
            sessionStorage.setItem('config', JSON.stringify(data))
            const config = new ConfigWrapper(data, defaultClientConfig)
            setConfig(config)
          }
        })
      }
      ref.current = true
    }

    // --- 4. 卸载时的清理函数 ---
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, [])

  const favicon = `${process.env.API_URL}/favicon`;

  return (
    <>
      <ClientConfigContext.Provider value={config}>
        <ProfileContext.Provider value={profile}>
          <Helmet>
            {favicon && <link rel="icon" href={favicon} />}
          </Helmet>
          <Switch>
            <RouteMe path="/">
              <FeedsPage />
            </RouteMe>

            <RouteMe path="/timeline">
              <TimelinePage />
            </RouteMe>
            
            <RouteMe path="/moments">
              <MomentsPage />
            </RouteMe>

            <RouteMe path="/friends">
              <FriendsPage />
            </RouteMe>

            <RouteMe path="/hashtags">
              <HashtagsPage />
            </RouteMe>

            <RouteMe path="/hashtag/:name">
              {params => <HashtagPage name={params.name || ""} />}
            </RouteMe>

            <RouteMe path="/search/:keyword">
              {params => <SearchPage keyword={params.keyword || ""} />}
            </RouteMe>

            <RouteMe path="/settings" paddingClassName='mx-4' requirePermission>
              <Settings />
            </RouteMe>

            <RouteMe path="/writing" paddingClassName='mx-4' requirePermission>
              <WritingPage />
            </RouteMe>

            <RouteMe path="/writing/:id" paddingClassName='mx-4' requirePermission>
              {({ id }) => {
                const id_num = tryInt(0, id)
                return <WritingPage id={id_num} />
              }}
            </RouteMe>

            <RouteMe path="/callback" >
              <CallbackPage />
            </RouteMe>

            <RouteWithIndex path="/feed/:id">
              {(params, TOC, clean) => <FeedPage id={params.id || ""} TOC={TOC} clean={clean} />}
            </RouteWithIndex>

            <RouteWithIndex path="/:alias">
              {(params, TOC, clean) => <FeedPage id={params.alias || ""} TOC={TOC} clean={clean} />}
            </RouteWithIndex>

            <RouteMe path="/user/github">
              {_ => (
                <TipsPage>
                  <Tips value={t('error.api_url')} type='error' />
                </TipsPage>
              )}
            </RouteMe>

            <RouteMe path="/*/user/github">
              {_ => (
                <TipsPage>
                  <Tips value={t('error.api_url_slash')} type='error' />
                </TipsPage>
              )}
            </RouteMe>

            <RouteMe path="/user/github/callback">
              {_ => (
                <TipsPage>
                  <Tips value={t('error.github_callback')} type='error' />
                </TipsPage>
              )}
            </RouteMe>

            <RouteMe>
              <ErrorPage error={t('error.not_found')} />
            </RouteMe>
          </Switch>
        </ProfileContext.Provider>
      </ClientConfigContext.Provider>
    </>
  )
}

function RouteMe({ path, children, headerComponent, paddingClassName, requirePermission }:
  { path?: PathPattern, children: React.ReactNode | ((params: DefaultParams) => React.ReactNode), headerComponent?: React.ReactNode, paddingClassName?: string, requirePermission?: boolean }) {
  if (requirePermission) {
    const profile = useContext(ProfileContext);
    const { t } = useTranslation();
    if (!profile?.permission)
      children = <ErrorPage error={t('error.permission_denied')} />;
  }
  return (
    <Route path={path} >
      {params => (
        <>
          <Header>
            {headerComponent}
          </Header>
          <Padding className={paddingClassName}>
            {typeof children === 'function' ? children(params) : children}
          </Padding>
          <Footer />
        </>
      )}
    </Route>
  )
}

function RouteWithIndex({ path, children }:
  { path: PathPattern, children: (params: DefaultParams, TOC: () => JSX.Element, clean: (id: string) => void) => React.ReactNode }) {
  const { TOC, cleanup } = useTableOfContents(".toc-content");
  return (
    <RouteMe path={path} headerComponent={TOCHeader({ TOC: TOC })} paddingClassName='mx-4'>
      {params => children(params, TOC, cleanup)}
    </RouteMe>
  )
}

export default App
