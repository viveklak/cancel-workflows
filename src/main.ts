import * as core from '@actions/core'
import * as github from '@actions/github'
import {run, workflowRunStatus} from './run'

function mustGetInputOrEnv(inputName: string, envVar: string): string {
  const val = getInput(inputName, {required: false})
  if (val !== '') {
    return val
  }
  const env = process.env[envVar]
  if (env === undefined) {
    throw Error(`Neither input: ${inputName} nor env var ${envVar} are defined`)
  }
  return env
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
      githubToken: mustGetInputOrEnv('access-token', 'GITHUB_TOKEN'),
      currentWorkflowRunId: Number(
        mustGetInputOrEnv('workflow-run-id', 'GITHUB_RUN_ID')
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
      dryRun: getBooleanInput('dry-run', {required: false}, true),
      rejectWorkflowRuns: getBooleanInput(
        'reject-waiting-workflow-runs',
        {required: false},
        false
      ),
      tagSuperseededWorkflowsWith: getInput(
        'tag-superseeded-workflows-with',
        {required: false},
        ''
      )
    })
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        error.stack ? `${error.message}:\n${error.stack}` : error.message
      )
      core.setFailed(error.message)
    }
  }
}

main()
