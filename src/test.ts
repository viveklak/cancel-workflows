import * as core from '@actions/core'
import * as github from '@actions/github'
import {RunOpts, run, workflowRunStatus} from './run'

async function main() {
  const {
    repo: {owner, repo}
  } = github.context

  // Define your inputs to simulate the behavior of your GitHub Action
  const inputs: RunOpts = {
    owner,
    repo,
    githubToken: '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',
    currentWorkflowRunId: 5409078004, // Provide the ID of the current workflow run
    limitToPreviousSuccessfulRunCommit: true, // Set to true or false based on your requirements
    lastSuccessfulRunId: 5396920117, // Provide the ID of the last successful workflow run, if applicable
    status: 'waiting', // Specify the desired status of workflows to cancel
    dryRun: true, // Set to true or false based on your requirements
    rejectWorkflowRuns: false, // Set to true or false based on your requirements
    tagSuperseededWorkflowsWith: 'deployed' // Specify the tag to be added to superseeded workflows, if applicable
  }

  try {
    await run(inputs)
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        error.stack ? `${error.message}:\n${error.stack}` : error.message
      )
      core.setFailed(error.message)
    }
  }
}

export default main
main()
