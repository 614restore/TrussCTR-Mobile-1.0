Feature: Mobile Auth And Session Resilience
  As a mobile user
  I want login and session recovery to remain stable
  So that the app does not hang on startup or resume

  Scenario: App unblocks even when profile fetch is slow
    Given a valid session exists
    When the profile query is delayed
    Then the app should leave loading state within timeout

  Scenario: Background resume refreshes missing profile
    Given a logged-in user with a null in-memory profile
    When the app returns to foreground
    Then profile recovery should be triggered automatically
