Feature: Native iOS Shell Integrity
  As a release engineer
  I want iOS shell config and schemes to remain valid
  So that archive and distribution remain reliable

  Scenario: App scheme and target are present
    When I inspect the Xcode project metadata
    Then scheme "App" should exist
    And target "App" should exist

  Scenario: Capacitor plugin packages resolve
    When I resolve Swift package dependencies
    Then Capacitor core and installed plugins should resolve without errors
