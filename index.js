const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const db = require("./db");
const { default: axios } = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());
const PORT = process.env.PORT || 5000;

const API_KEY = process.env.GHL_API_KEY;
const GHL_CONTACTS_URL = "https://rest.gohighlevel.com/v1/contacts/";
const GHL_CUSTOM_FIELDS_URL = "https://rest.gohighlevel.com/v1/custom-fields/";

app.get("/get-contacts", async (req, res) => {
  try {
    // Fetch contacts
    const allContacts = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(
        `${GHL_CONTACTS_URL}?page=${currentPage}&limit=100`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const contacts =
        response.data?.contacts || response.data?.data?.contacts || [];
      allContacts.push(...contacts);

      hasMore = contacts.length === 100;
      currentPage++;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Fetch all custom fields
    const customFieldsResponse = await axios.get(GHL_CUSTOM_FIELDS_URL, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const contacts = allContacts || [];
    const customFieldsData = customFieldsResponse.data?.customFields || [];

    if (!Array.isArray(customFieldsData)) {
      return res
        .status(500)
        .json({ success: false, error: "Invalid custom fields response" });
    }

    const customFieldsMap = {};

    customFieldsData.forEach((field) => {
      customFieldsMap[field.id] = {
        name: field.name,
        group: field.group || "General",
      };
    });

    const formattedContacts = contacts.map((contact) => {
      let structuredCustomFields = {};
      let owners = [{}, {}];

      if (contact.customField && Array.isArray(contact.customField)) {
        contact.customField.forEach((field) => {
          if (customFieldsMap[field.id]) {
            const { name, group } = customFieldsMap[field.id];

            if (!structuredCustomFields[group]) {
              structuredCustomFields[group] = {};
            }

            if (name.startsWith("1st Owner")) {
              const ownerField = name.replace("1st Owner ", "");
              owners[0][ownerField] = field.value;
            } else if (
              name.startsWith("2nd Owner") ||
              name.startsWith("2nd-Owner")
            ) {
              const ownerField = name.replace(/2nd(-|\s)Owner /, "");
              owners[1][ownerField] = field.value;
            } else {
              structuredCustomFields[group][name] = field.value;
            }
          }
        });
      }

      owners = owners.filter((owner) => Object.keys(owner).length > 0);

      return {
        id: contact.id,
        name:
          `${contact.firstName || ""} ${contact.lastName || ""}`.trim() ||
          "N/A",
        email: contact.email || "N/A",
        phone: contact.phone || "N/A",
        customFields: structuredCustomFields,
        owners,
      };
    });

    // Get transaction data
    const transactionData = await getAllTransactions();

    // Group transactions by matching MySQL User-Email
    const emailTransactionMap = {};

    formattedContacts.forEach((contact) => {
      const businessLegalName =
        contact.customFields?.General?.["Business Legal Name"];
      const mySQLUserEmail =
        contact.customFields?.General?.["MySQL User-Email"] || contact.email;

      if (!businessLegalName || !mySQLUserEmail || mySQLUserEmail === "N/A")
        return;

      // Find matching transactions for this contact
      const matchingTransactions = transactionData.filter((transaction) =>
        businessLegalName
          .toLowerCase()
          .includes(transaction.merchant_name.toLowerCase())
      );

      if (matchingTransactions.length > 0) {
        if (!emailTransactionMap[mySQLUserEmail]) {
          emailTransactionMap[mySQLUserEmail] = {
            contactInfo: {
              name: contact.name,
              email: mySQLUserEmail,
              originalContactEmail: contact.email,
              phone: contact.phone,
              businessLegalName,
              mySQLUserName: contact.customFields?.General?.["MySQL-User-Name"],
            },
            transactions: [],
          };
        }
        emailTransactionMap[mySQLUserEmail].transactions.push(
          ...matchingTransactions
        );
      }
    });

    // Convert to array format
    const result = Object.values(emailTransactionMap).map((item) => ({
      email: item.contactInfo.email,
      originalContactEmail: item.contactInfo.originalContactEmail,
      contactName: item.contactInfo.name,
      businessName: item.contactInfo.businessLegalName,
      mySQLUserName: item.contactInfo.mySQLUserName,
      transactions: item.transactions.map((t) => ({
        id: t.id,
        merchant: t.merchant_name,
        amount: t.amount,
        date: t.originate_date,
        status: t.current_status,
        transactionId: t.transaction_id,
        notes: t.notes,
      })),
      totalTransactions: item.transactions.length,
      totalAmount: item.transactions.reduce(
        (sum, t) => sum + parseFloat(t.amount),
        0
      ),
    }));

    res.json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const getAllTransactions = async () => {
  try {
    const [rows] = await db.query("SELECT * FROM transactions");
    return rows;
  } catch (err) {
    throw new Error(`Failed to fetch transactions: ${err.message}`);
  }
};

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
