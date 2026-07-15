/**
 * ReceiptGenius - Google Apps Script Webhook
 * Handles incoming POST requests from the ReceiptGenius React Native Mobile App
 * and appends structured receipt rows into the active Google Sheet.
 *
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open your Google Sheet -> Extensions -> Apps Script
 * 2. Paste this file into Code.gs
 * 3. Click Deploy -> New deployment
 * 4. Select type: Web app
 * 5. Execute as: Me
 * 6. Who has access: Anyone
 * 7. Copy the Web App URL into your React Native app configuration.
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Create header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp",
        "Receipt ID",
        "Date",
        "Merchant",
        "Category",
        "Total Amount",
        "Tax",
        "Subtotal",
        "Currency",
        "Payment Method",
        "Confidence Score",
        "Line Items Summary"
      ]);
      const headerRange = sheet.getRange("A1:L1");
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#171f33");
      headerRange.setFontColor("#4edea3");
    }

    const rawContent = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const payload = JSON.parse(rawContent);
    
    // Format line items array into readable summary string
    const lineItemsSummary = Array.isArray(payload.lineItems)
      ? payload.lineItems.map(item => `${item.description || "Item"} ($${Number(item.price || 0).toFixed(2)})`).join("; ")
      : "";

    const rowData = [
      new Date().toISOString(),
      payload.id || "REC-" + Date.now(),
      payload.date || new Date().toISOString().split("T")[0],
      payload.merchant || "Unknown Merchant",
      payload.category || "Other",
      Number(payload.totalAmount || 0),
      Number(payload.tax || 0),
      Number(payload.subtotal || 0),
      payload.currency || "USD",
      payload.paymentMethod || "Card",
      Number(payload.confidenceScore || 1.0),
      lineItemsSummary
    ];

    sheet.appendRow(rowData);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Receipt logged successfully to Google Sheets",
      rowNumber: sheet.getLastRow(),
      receiptId: payload.id
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "ReceiptGenius Google Sheets Webhook",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
