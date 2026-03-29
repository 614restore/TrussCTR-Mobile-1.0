Feature: Mobile Navigation Stability
  As a field user
  I want smooth navigation and scrolling behavior
  So that actions remain reachable on smaller screens

  Scenario: Pipeline horizontal sections preserve vertical scroll priority
    Given I am on the pipeline page
    When I scroll vertically while section chips are visible
    Then vertical page scrolling should remain responsive

  Scenario: Contact detail tab scroller does not break tab selection
    Given I am on contact detail
    When I switch tabs and scroll horizontally in tab rail
    Then tab selection should remain accurate
