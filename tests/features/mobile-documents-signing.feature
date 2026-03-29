Feature: Mobile Documents And Signing Visibility
  As a sales user
  I want signed documents visible in both local and global views
  So that signed artifacts are always discoverable

  Scenario: Signed document appears on customer documents tab
    Given a document is signed in the mobile signer
    When I open the customer's documents tab
    Then the signed PDF should be listed

  Scenario: Signed document appears in global Documents view
    Given a signed document exists for a contact
    When I open global Documents
    Then I should be able to open that signed document from the list
