# Contributing to ravel-postgresql-provider

## Rules

- PR everything. Commits made directly to `main` are prohibited, except under specific circumstances
- Use feature branches. **Create an issue for every single feature or bug** and **label** it. If you are a core contributor, create a branch named feature/[issue #] to resolve the issue. If you are not a core contributor, fork and branch.
- Try to label issues and PRs as accurately as possible, especially in the case of PRs, where `semver-major`, `semver-minor` and `semver-patch` labels are available. Labels on issues should be a subset of the labels on the corresponding pull request; the milestones should match.
- Use github "Fixes #[issue]" syntax on your PRs to indicate which issues you are attempting to resolve
- Code coverage should strictly be enforced at 100%
- Please follow the JavaScript coding style exemplified by existing source files and enforced by Ravel's `.eslintrc.json` configuration.

## Developing and Testing

## Running tests:

To test (with code coverage):

```bash
$ docker run --rm -e POSTGRES_USER=ravel -e POSTGRES_PASSWORD=password -p 15432:5432 postgres:10.0-alpine
$ npm test
```

Due to a [bug in istanbul](https://github.com/gotwarlost/istanbul/issues/274), failing tests will report incorrect line numbers. For this situation, use `test-no-cov`, which will omit code coverage reporting and give you accurate line numbers.

```bash
$ docker run --rm -e POSTGRES_USER=ravel -e POSTGRES_PASSWORD=password -p 15432:5432 postgres:10.0-alpine
$ npm run test-no-cov
```
