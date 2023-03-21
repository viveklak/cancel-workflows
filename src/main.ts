import * as core from '@actions/core'
import * as github from '@actions/github'
import {run, workflowRunStatus} from './run'

function mustGetEnvOrInput(envVar: string, inputName: string): string {
  return process.env[envVar] ?? getInput(inputName, {required: true})
}

function getBooleanInput(
  name: string,
  options?: core.InputOptions,
  defaultValue = false
): boolean {
  try {
    return core.getBooleanInput(name, options)
  } catch (ex) {
    return defaultValue
  }
}

function getInput(
  name: string,
  options?: core.InputOptions,
  defaultValue?: string
): string {
  try {
    return core.getInput(name, options)
  } catch (ex) {
    if (defaultValue) {
      return defaultValue
    }
    throw ex
  }
}

async function main(): Promise<void> {
  const {
    repo: {owner, repo}
  } = github.context
  const lastSuccessfulRun = getInput('last-successful-run-id', {
    required: false
  })
  try {
    await run({
      owner,
      repo,
      githubToken: mustGetEnvOrInput('GITHUB_TOKEN', 'access-token'),
      currentWorkflowRunId: Number(
        mustGetEnvOrInput('GITHUB_RUN_ID', 'workflow-run-id')
      ),
      limitToPreviousSuccessfulRunCommit: getBooleanInput(
        'limit-to-previous-successful-run-commit'
      ),
      lastSuccessfulRunId: lastSuccessfulRun
        ? Number(lastSuccessfulRun)
        : undefined,
      status: getInput(
        'status-of-workflows-to-cancel',
        {
          required: true
        },
        'waiting'
      ) as workflowRunStatus,
      dryRun: getBooleanInput('dry-run', {required: false}, true)
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

main()
