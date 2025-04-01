const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
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

    // Fetch contacts with pagination
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
    console.log(allContacts, "allContacts");
    const contacts = allContacts || [];
    const customFieldsData = customFieldsResponse.data?.customFields || [];

    if (!Array.isArray(customFieldsData)) {
      return res
        .status(500)
        .json({ success: false, error: "Invalid custom fields response" });
    }

    const customFieldsMap = {};

    // Map custom field IDs to names and groups
    customFieldsData.forEach((field) => {
      customFieldsMap[field.id] = {
        name: field.name,
        group: field.group || "General",
      };
    });

    const formattedContacts = contacts.map((contact) => {
      let structuredCustomFields = {};
      let owners = [{}, {}]; // Array to store 1st and 2nd owner objects

      if (contact.customField && Array.isArray(contact.customField)) {
        contact.customField.forEach((field) => {
          if (customFieldsMap[field.id]) {
            const { name, group } = customFieldsMap[field.id];

            if (!structuredCustomFields[group]) {
              structuredCustomFields[group] = {};
            }

            if (name.startsWith("1st Owner")) {
              const ownerField = name.replace("1st Owner ", "");
              owners[0][ownerField] = field.value; // Store in first owner object
            } else if (
              name.startsWith("2nd Owner") ||
              name.startsWith("2nd-Owner")
            ) {
              const ownerField = name.replace(/2nd(-|\s)Owner /, ""); // Handle different formats
              owners[1][ownerField] = field.value; // Store in second owner object
            } else {
              structuredCustomFields[group][name] = field.value; // Store other custom fields
            }
          }
        });
      }

      // Remove empty owner objects
      owners = owners.filter((owner) => Object.keys(owner).length > 0);

      return {
        id: contact.id,
        name:
          `${contact.firstName || ""} ${contact.lastName || ""}`.trim() ||
          "N/A",
        email: contact.email || "N/A",
        phone: contact.phone || "N/A",
        customFields: structuredCustomFields,
        owners, // Store owners as an array
      };
    });

    res.json({
      success: true,
      count: formattedContacts?.length,
      data: formattedContacts,
    });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
