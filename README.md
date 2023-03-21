<p align="center">
  <a href="https://github.com/viveklak/cancel-workflows/actions"><img alt="typescript-action status" src="https://github.com/viveklak/cancel-workflows/workflows/build-test/badge.svg"></a>
</p>

# Cancel Superseded Workflow Runs Action

This is a Github Action that will reject or cancel workflow runs in `waiting` state which have been `superseded` by later changes based on previous commits within a branch (`main` by default).

# When should I use this?

1. You use Github workflows to deploy code. Specifically you use [Trunk based development](https://trunkbaseddevelopment.com/#scaled-trunk-based-development) to allow each PR merge to progress through your deployment pipeline.
2. You have [manual approval](https://docs.github.com/en/actions/managing-workflow-runs/reviewing-deployments) enabled in some part of your deployment workflow, resulting in potentially multiple workflow runs stuck in `waiting` state
3. You want the ability to automatically `reject` or `cancel` workflow runs which have been `superseded` by more recent changes

Concretely suppose PR `A` was merged and progressed through the pipeline until it reached a deployment to a production ` environment` which requires manual approval. This workflow run is now in `waiting` state. Subsequently a bug in `A` was discovered and fixed in PR `B` which also got to the manual approval step. Now we have two workflows in `waiting` state. Eventually, the workflow associated with `B` is approved and deployed. In this case workflow run `A` is effectively `superseded` - i.e. `B` has all the changes of `A` and some additional fixes and that `A` should never really be deployed to `production`. However, the workflow run for `A` will stick around in `waiting` state until the default (and apparently unconfigurable) timeout of 30 days. Apart from being an eye-sore, this also leaves open the opportunity to accidentally approve the workflow for `A` which could overwrite the changes in `B` and unleash a bug in production 😰!

This action could be added at the end of the deployment workflow to determine all the workflow runs for a particular workflow which match the definition of `superseded` above. i.e.:

1. Workflow runs triggered off the same branch but later commit than the currently approved workflow run
2. Workflow run is currently in `waiting` state

Alternatively this could be added into a dispatch workflow to periodically cleanup old workflow runs

# How to use it?

## From deployment workflow

```
jobs:
...
  deploy-prod:
    name: Deploy Prod
    runs-on: ubuntu-latest
    environment: prod # Here prod has manual approval required
    permissions:
      contents: read
      id-token: write
  cancel-superseded-workflows:
    runs-on: ubuntu-latest
    if: ${{ always() && contains(join(needs.*.result, ','), 'success') }}
    needs: [deploy-prod]
    steps:
      - uses: viveklak/cancel-workflows@v1.1.1
        with:
          # workflow-run-id will be set to current workflow run ID
          # workflow-run-id: ${{ inputs.workflow-run-id }}
          limit-to-previous-successful-run-commit: "true"
          # Flip this when you are ready to cancel workflows
          dry-run: "true"
```

## As dispatch workflow

```
name: cancel-superseded-workflows

on:
  workflow_dispatch:
    inputs:
      workflow-run-id:
        type: string
        description: The currently preferred workflow run to supersede previous workflows runs with
        required: true
      last-successful-run-id:
        type: string
        required: false
        description: The workflow run to stop at when looking for cancelable workflows. Defaults to most recent successful workflow otherwise.
      dry-run:
        type: string
        required: false
        description: Don't actually cancel but just print the workflows to be cancelled. Default is true.
        # Flip this when you are ready to cancel workflows
        default: "true"

jobs:
  cancel-superseded-workflows:
    name: Cancel Superseded Workflows
    runs-on: ubuntu-latest
    concurrency: cancel-superseded-workflows
    steps:
      - uses: viveklak/cancel-workflows@v1.1.1
        with:
          workflow-run-id: ${{ inputs.workflow-run-id }}
          limit-to-previous-successful-run-commit: "true"
          last-successful-run-id: ${{ inputs.last-successful-run-id }}
          dry-run: ${{ inputs.dry-run }}

```

# Acknowledgement

This Action was inspired heavily by https://github.com/styfle/cancel-workflow-action. By the authors' own admission, that action is probably now obsoleted by job and workflow level [concurrency control](https://docs.github.com/en/actions/using-jobs/using-concurrency), but the above use case is still under-served. I decided to adapt this action to the above use case.
