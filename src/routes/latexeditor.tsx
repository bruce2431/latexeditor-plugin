import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import LatexeditorScreen from '@/screens/latexeditor/latexeditor-screen'

export const Route = createFileRoute('/latexeditor')({
  SSR: false,
  component: latexeditorRoute,
})

function latexeditorRoute() {
  usePageTitle('LaTeX Editor')
  return <LatexeditorScreen />
}
