import { getProjecten } from '@/lib/actions'
import { vereisModuleToegang } from '@/lib/rechten'
import { ProjectList } from './project-list'

export const revalidate = 15

export default async function ProjectenPage() {
  await vereisModuleToegang('/projecten')
  const projecten = await getProjecten()
  return <ProjectList projecten={projecten} />
}
