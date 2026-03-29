Feature: Mobile Scheduling And Next Step
  As a coordinator
  I want schedule-next-step actions to persist reliably
  So that appointments and follow-ups are not lost

  Scenario: Schedule Next Step saves from calendar flow
    Given a contact exists in lead flow
    When I schedule the next step and save
    Then a calendar entry should exist for that contact

  Scenario: Inspection completion advances status once
    Given a contact is in appointment_set stage
    When I mark inspection complete
    Then contact status should advance to inspected once
