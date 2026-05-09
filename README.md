#附件 


这是一个Hermes-Workspace的LaTex编辑器插件！

# 如何插入？

我们首先需要在原前端项目引入该插件入口，📁相关文件：

1. `src/components/mobile-tab-bar.tsx` - 移动端导航栏组件
2. `src/routes/latexeditor.tsx` - LaTeX编辑器路由文件
3. `src/screens/chat/components/chat-sidebar.tsx` - 桌面端侧边栏组件
4. `\src\lib\i18n.ts` - 导航定义

## 移动端导航栏组件

我们需要做两件事：
- 在 `src/components/mobile-tab-bar.tsx` 文件的TABS数组中添加了LaTeX编辑器标签
- 在该文件中添加了LockerIcon导入，并将TabItem中的icon修改为LockerIcon
**具体修改**：
  1. 在导入部分添加 `LockerIcon`
  2. 将TabItem添加 `icon: LockerIcon`
- **修改后的代码**：
  ```typescript
  // 导入部分（第3-14行）
  import {
    BrainIcon,
    Chat01Icon,
    Clock01Icon,
    CommandLineIcon,
    DashboardSquare01Icon,
    File01Icon,
    LockerIcon,  // 新增：使用储物柜图标
    PuzzleIcon,
    Settings01Icon,
    UserGroupIcon,
  } from '@hugeicons/core-free-icons'
  
  // TabItem部分（第110-116行）
  {
    id: 'Latex-editor',
    label: 'latex',
    icon: LockerIcon,  // 使用LockerIcon
    to: '/latexeditor',
    match: (p) => p.startsWith('latexeditor'),
  },
  ```

##创建LaTeX编辑器路由文件
我们现在需要创建了 `/latexeditor` 路由文件，并在 `latexeditor.tsx` 文件中写入路由代码
- **路由配置**：现在 `/latexeditor` 路径有了对应的路由文件
- **具体代码**：
  ```typescript
  import { createFileRoute } from '@tanstack/react-router'
  import { usePageTitle } from '@/hooks/use-page-title'
  import { LatexeditorScreen } from '@/screens/latexeditor/latexeditor-screen'

  export const Route = createFileRoute('/latexeditor')({
    SSR: false,
    component: latexeditorRoute,
  })

  function latexeditorRoute() {
    usePageTitle('Latexeditor')
    return <LatexeditorScreen />
  }
  ```
- **代码说明**：
  1. 使用 `createFileRoute` 创建 `/latexeditor` 路由
  2. 禁用SSR（服务器端渲染）
  3. 使用 `usePageTitle` 设置页面标题为 "Latexeditor"
  4. 渲染 `latexeditorScreen` 组件
- **依赖组件**：引用了 `@/screens/latexeditor/latexeditor-screen`，该组件需要存在

## 创建LaTeX编辑器屏幕组件目录和文件
- **具体操作**：从`https://github.com/bruce2431/latexeditor-plugin`下载相关代码并按如下方式拷贝文件夹。
- **目录结构**：
  ```
  src/screens/latexeditor/
  └── latexeditor-screen.tsx  (空文件，待填充内容)
  ```


## 侧边栏修改

在这里我们需要做三件事：
- 添加LockerIcon导入到侧边栏
- 定义 `islatexeditorActive` 变量
- 在 `chat-sidebar.tsx` 文件的 `mainItems` 数组中添加了LaTeX编辑器导航项

### 添加LockerIcon导入到侧边栏

在 `chat-sidebar.tsx` 文件的导入部分添加了 `LockerIcon`
- **具体位置**：在第13行添加了 `LockerIcon` 导入
- **修改后的导入代码**：
  ```typescript
  import {
    ArrowDown01Icon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    BrainIcon,
    Chat01Icon,
    CheckListIcon,
    Clock01Icon,
    ComputerTerminal01Icon,
    DashboardSquare01Icon,
    File01Icon,
    LockerIcon,  // 新增：用于LaTeX编辑器导航项
    MessageMultiple01Icon,
    Moon02Icon,
    PencilEdit02Icon,
    PuzzleIcon,
    Search01Icon, Settings01Icon, Sun02Icon, UserGroupIcon, UserMultipleIcon
  } from '@hugeicons/core-free-icons'
  ```


### 定义 `islatexeditorActive` 变量

- **位置**：第562行，在 `// Route active states` 注释部分
- **具体代码**：
    ```typescript
    
    // 修改前
    const mainRoutes = ['/chat', '/new', '/files', '/terminal']
    
    // 修改后
    const islatexeditorActive = pathname === '/latexeditor'
    const mainRoutes = ['/chat', '/new', '/files', '/terminal', '/latexeditor']
    ```

### 在 `chat-sidebar.tsx` 文件的 `mainItems` 数组中添加了LaTeX编辑器导航项
- **具体位置**：`mainItems` 数组的最后一项（第796-802行）
- **具体代码**：
  ```typescript
  {
    kind: 'link',
    to: '/latexeditor',
    icon: LockerIcon,
    label: t('nav.latexeditor'),
    active: islatexeditorActive,
  },
  ```


## 添加导航定义导入到侧边栏
在 `i18.ts` 文件的导入部分添加了 `'nav.latexeditor': 'Latex editor',`
- **具体修改**：在第22行添加了 `'nav.latexeditor': 'Latex editor',` 导入
- **具体代码**：
  ```typescript
  // Nav
  'nav.dashboard': 'Dashboard',
  'nav.chat': 'Chat',
  'nav.files': 'Files',
  'nav.terminal': 'Terminal',
  'nav.jobs': 'Jobs',
  'nav.tasks': 'Tasks',
  'nav.memory': 'Memory',
  'nav.skills': 'Skills',
  'nav.profiles': 'Profiles',
  'nav.settings': 'Settings',
  'nav.latexeditor': 'Latex editor', //新增导入

  ```

- **说明**：完成了 `chat-sidebar.tsx` 文件的 `mainItems` 数组中LaTeX编辑器导航项的导航定义。

### [18:28] 添加依赖
- **行为**：用户在 `package.json` 文件添加了部份依赖
- **文件位置**：`\package.json`
- **具体修改**：在第61行添加依赖
- **具体代码**：
  ```typescript

  "dependencies": {

    ...

    "@codemirror/commands": "^6.8.1",
    "@codemirror/language": "^6.11.0",
    "@codemirror/state": "^6.5.2",
    "@codemirror/view": "^6.36.5",
    "idb": "^8.0.2",
    "jszip": "^3.10.1",
    "lucide-react": "^0.525.0",
    "react-resizable-panels": "^2.1.7"
  }

  ```

