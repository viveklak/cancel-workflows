import * as core from '@actions/core'
import * as github from '@actions/github'
/* eslint-disable  import/no-unresolved */
import {components} from '@octokit/openapi-types'

export type workflowRunStatus = components['parameters']['workflow-run-status']

export interface RunOpts {
  owner: string
  repo: string
  githubToken: string
  currentWorkflowRunId: number
  limitToPreviousSuccessfulRunCommit: boolean
  lastSuccessfulRunId?: number
  status?: workflowRunStatus
  dryRun: boolean
  rejectWorkflowRuns?: boolean
}

interface workflowRun {
  id: number
  html_url: string
}

export async function run(opts: RunOpts): Promise<void> {
  const {owner, repo} = opts

  const octokit = github.getOctokit(opts.githubToken)

  const repoInfo = await octokit.rest.repos.get({owner, repo})
  const defaultBranch = repoInfo.data.default_branch

  const {data: current_run} = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: opts.currentWorkflowRunId
  })
  const branch = current_run.head_branch ?? defaultBranch
  core.info(`Resolved run ${opts.currentWorkflowRunId} to branch: ${branch}`)

  const workflow_id = String(current_run.workflow_id)
  try {
    const workflow_runs = await octokit.paginate(
      octokit.rest.actions.listWorkflowRuns,
      {
        per_page: 100,
        owner,
        repo,
        workflow_id,
        branch
      },
      (response, done) => {
        let res = response.data.workflow_runs
        if (opts.status) {
          res = res.filter(resp => resp.status === opts.status)
        }
        // Don't actually want to look through all the runs - if we find some matching the status, lets return
        //
        if (res.length > 0) {
          done()
        }
        return res
      }
    )

    let lastCommit = ''
    if (opts.limitToPreviousSuccessfulRunCommit) {
      if (!opts.lastSuccessfulRunId) {
        const completed = await octokit.rest.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id,
          branch,
          status: 'success',
          per_page: 10
        })
        // We may be run as a dispatch workflow from the currentWorkflowRunId which
        // could be marked as complete already. Filter it out.
        const previouslyCompleted = completed.data.workflow_runs.filter(
          w => w.id !== opts.currentWorkflowRunId
        )
        if (previouslyCompleted.length > 0) {
          const [first] = previouslyCompleted
          lastCommit = first.head_sha
          core.info(
            `Last successfully completed workflow run: ${first.id} for commit: ${lastCommit}`
          )
        }
      } else {
        const lastSuccessfulRun = await octokit.rest.actions.getWorkflowRun({
          owner,
          repo,
          run_id: opts.lastSuccessfulRunId
        })
        lastCommit = lastSuccessfulRun.data.head_sha
        core.info(
          `Last successfully completed workflow run: ${lastSuccessfulRun.data.id} for commit: ${lastCommit}`
        )
      }
    }

    if (workflow_runs.length > 0) {
      // sha -> workflow
      const shasToWorkflowRuns = Object.fromEntries(
        workflow_runs.map(workflow => [workflow.head_sha, workflow])
      )
      const commits = await octokit.paginate(
        octokit.rest.repos.listCommits,
        {
          owner: opts.owner,
          repo: opts.repo,
          sha: current_run.head_sha,
          per_page: 100
        },
        (response, done) => {
          const idx = response.data.findIndex(
            commit => commit.sha === lastCommit
          )
          if (idx >= 0) {
            done()
            return response.data.slice(0, idx)
          }
          return response.data
        }
      )
      let toCancel: workflowRun[] = []
      toCancel = commits.reduce((tc, commit) => {
        if (!(commit.sha in shasToWorkflowRuns)) {
          return tc
        }
        const workflow = shasToWorkflowRuns[commit.sha]
        if (
          workflow.conclusion !== 'completed' &&
          workflow.id !== current_run.id
        ) {
          tc.push(workflow)
        }
        return tc
      }, toCancel)

      for (const wf of toCancel) {
        const deployments =
          await octokit.rest.actions.getPendingDeploymentsForRun({
            owner,
            repo,
            run_id: wf.id
          })
        core.info(
          `Will try to cancel workflow run: ${
            wf.id
          } waiting on ${deployments.data.map(d => d.environment.name)}`
        )
        if (!opts.dryRun && deployments.data.length > 0) {
          if (opts.rejectWorkflowRuns) {
            await octokit.rest.actions.reviewPendingDeploymentsForRun({
              owner,
              repo,
              state: 'rejected',
              run_id: wf.id,
              environment_ids: deployments.data
                .map(d => d.environment.id)
                .filter((d): d is number => !!d),
              comment: `Superseded by workflow run ${current_run.html_url}`
            })
          } else {
            await octokit.rest.actions.cancelWorkflowRun({
              owner,
              repo,
              run_id: wf.id
            })
          }
        }
      }
    }
    core.info(`Completed cancellations for ${current_run.id}...`)
    return
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message || error
      core.info(`Error while canceling workflow_id ${workflow_id}: ${msg}`)
    }
    throw error
  }
}
