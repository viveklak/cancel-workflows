import * as core from '@actions/core'
import * as github from '@actions/github'
import {run, workflowRunStatus} from './run'

function mustGetEnvOrInput(envVar: string, inputName: string): string {
  return process.env[envVar] ?? core.getInput(inputName, {required: true})
}

async function main(): Promise<void> {
  const {
    repo: {owner, repo},
    payload
  } = github.context
  const lastSuccessfulRun = core.getInput('last-successful-run-id', {
    required: false
  })
  try {
    await run({
      owner,
      repo,
      githubToken: core.getInput('access-token'),
      currentWorkflowRunId: Number(
        mustGetEnvOrInput('GITHUB_RUN_ID', 'workflow-run-id')
      ),
      payload,
      limitToPreviousSuccessfulRunCommit: core.getBooleanInput(
        'limit-to-previous-successful-run-commit',
        {required: false}
      ),
      lastSuccessfulRunId: lastSuccessfulRun
        ? Number(lastSuccessfulRun)
        : undefined,
      status: core.getInput('status-of-workflows-to-cancel', {
        required: true
      }) as workflowRunStatus,
      dryRun: core.getBooleanInput('dry-run', {required: true})
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

main()
