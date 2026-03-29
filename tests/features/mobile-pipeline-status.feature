Feature: Mobile Pipeline Status Consistency
  As an operations user
  I want status aliases to resolve consistently
  So that pipeline, contact detail, and milestones stay aligned

  Scenario: Alias appointment statuses map to appointment_set stage
    Given a contact status is "appt_set"
    When I view the pipeline
    Then the contact should appear in "Appt Set"

  Scenario: Inspection aliases map to inspected stage
    Given a contact status is "inspection_complete"
    When I view contact status timeline
    Then the status should resolve to "Inspected"

  Scenario: Paid retains paid-specific milestone semantics
    Given a contact status is "paid"
    When I open contact milestones
    Then paid-dependent milestones should be complete
    And the contact should not regress to non-paid behavior
