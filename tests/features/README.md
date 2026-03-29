# Mobile Gherkin Feature Suite

This folder defines mobile behavior contracts in Gherkin format for audit and regression planning.

## Feature Files

- `mobile-auth-session.feature`
- `mobile-pipeline-status.feature`
- `mobile-scheduling-next-step.feature`
- `mobile-documents-signing.feature`
- `mobile-native-ios-shell.feature`
- `mobile-navigation-stability.feature`

## Suggested Parse Command

```bash
npx @cucumber/cucumber --dry-run 'tests/features/**/*.feature'
```

Note:
- This repo currently does not ship step definitions; scenarios are contract specs until step glue is added.
