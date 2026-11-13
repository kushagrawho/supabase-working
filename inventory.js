
const INVENTORY_STORAGE_KEY = "bizpilot_inventory_v1";

// Read inventory records from browser storage
function loadInventory() {
  try {
    const records = JSON.parse(
      localStorage.getItem(INVENTORY_STORAGE_KEY)
    );

    return Array.isArray(records) ? records : [];
  } catch (error) { 
    return [];
  }
}

// Save inventory records
function saveInventory(items) {
  localStorage.setItem(
    INVENTORY_STORAGE_KEY,
    JSON.stringify(items)
  );
}

// Prevent HTML entered by users from being interpreted as code
function escapeInventoryHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// Display weight in grams
function formatInventoryWeight(weight) {
  return Number(weight).toLocaleString("en-IN", {
    maximumFractionDigits: 3
  }) + " g";
}

// Display the Inventory page
async function renderInventoryPage() {
  const { data, error } = await VasundharaDB.select("inventory");

  if (error) {
    throw error;
  }

  const items = (data || []).map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    weightGrams: item.weight_grams
  }));

  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0), 0
  );

  const totalWeight = items.reduce(
    (sum, item) => sum + Number(item.weightGrams || 0), 0
  );

  const rows = items.length
    ? items.map(item => `
        <tr data-inventory-row>
          <td><strong>${escapeInventoryHTML(item.name)}</strong></td>
          <td>${Number(item.quantity)} pcs</td>
          <td>${formatInventoryWeight(item.weightGrams)}</td>
          <td>
            <button
              type="button"
              class="muted-link"
              data-inventory-edit="${escapeInventoryHTML(item.id)}"
            >
              Edit stock
            </button>
          </td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="4" class="empty-note">
            No inventory items added yet.
            Add your first item using the form below.
          </td>
        </tr>
      `;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-top">Item types</div>
        <div class="stat-value">${items.length}</div>
        <div class="stat-foot">Different inventory items</div>
      </div>

      <div class="stat-card">
        <div class="stat-top">Total quantity</div>
        <div class="stat-value">
          ${totalQuantity.toLocaleString("en-IN")}
        </div>
        <div class="stat-foot">Pieces across all items</div>
      </div>

      <div class="stat-card">
        <div class="stat-top">Total inventory weight</div>
        <div class="stat-value">
          ${formatInventoryWeight(totalWeight)}
        </div>
        <div class="stat-foot">Combined weight of all items</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Inventory list</h3>
          <div class="panel-sub">
            View and manage your available stock.
          </div>
        </div>

        <button type="button" class="muted-link" id="inventoryExport">
          Export CSV ↓
        </button>
      </div>

      <div class="module-toolbar">
        <input
          type="search"
          id="inventorySearch"
          class="search-input"
          placeholder="Search item name..."
        />

        <span class="panel-sub">
          ${items.length} item types
        </span>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Item name</th>
              <th>Available quantity</th>
              <th>Total weight</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody id="inventoryTableBody">
            ${rows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Add inventory item</h3>
          <div class="panel-sub">
            Enter the total quantity and combined weight.
          </div>
        </div>
      </div>

      <form id="inventoryForm" class="inventory-form">

        <div class="inventory-field">
          <label for="inventoryItemName">Item name</label>
          <input
            type="text"
            id="inventoryItemName"
            name="itemName"
            class="search-input"
            placeholder="Example: Payal"
            required
          />
        </div>

        <div class="inventory-field">
          <label for="inventoryQuantity">Quantity (pieces)</label>
          <input
            type="number"
            id="inventoryQuantity"
            name="quantity"
            class="search-input"
            placeholder="Example: 10"
            min="1"
            step="1"
            required
          />
        </div>

        <div class="inventory-field">
          <label for="inventoryWeight">Total weight (grams)</label>
          <input
            type="number"
            id="inventoryWeight"
            name="weight"
            class="search-input"
            placeholder="Example: 100"
            min="0.001"
            step="0.001"
            required
          />
        </div>

        <button type="submit" class="small-button">
          + Add item
        </button>

      </form>

      <p class="panel-sub inventory-note">
        Weight means the combined weight of all available pieces.
        Individual pieces can have different weights.
      </p>
    </div>
  `;
}


// Add a new inventory item

document.addEventListener("submit", async function(event) {
  if (event.target.id !== "inventoryForm") return;

  event.preventDefault();

  const form = event.target;

  const name = form.elements.itemName.value.trim();
  const quantity = Number(form.elements.quantity.value);
  const weight = Number(form.elements.weight.value);

  if (!name) {
    toast("Please enter an item name.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    toast("Quantity must be a positive whole number.");
    return;
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    toast("Please enter a valid weight greater than zero.");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Adding...";

  try {
    const { data, error } = await VasundharaDB.insert("inventory", {
      name: name,
      quantity: quantity,
      weight_grams: weight
    });

    if (error) {
      if (error.code === "23505") {
        toast("This inventory item already exists.");
      } else {
        console.error("Inventory insert error:", error);
        toast("Unable to add inventory item.");
      }
      return;
    }

    toast("Inventory item added successfully.");
    await render("inventory");

  } catch (error) {
    console.error("Inventory error:", error);
    toast("Unable to add inventory item. Please try again.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "+ Add item";
  }
});



// Search inventory items
document.addEventListener("input", function(event) {
  if (event.target.id !== "inventorySearch") return;

  const searchText = event.target.value.toLowerCase();

  document.querySelectorAll("[data-inventory-row]").forEach(row => {
    row.style.display =
      row.textContent.toLowerCase().includes(searchText) ? "" : "none";
  });
});


// Edit the current total quantity and weight of an item

document.addEventListener("click", async function(event) {
  const editButton = event.target.closest("[data-inventory-edit]");

  if (editButton) {
    const itemId = editButton.dataset.inventoryEdit;

    try {
      const { data: items, error: fetchError } =
        await VasundharaDB.select("inventory");

      if (fetchError) throw fetchError;

      const item = (items || []).find(
        entry => entry.id === itemId
      );

      if (!item) {
        toast("Inventory item not found.");
        return;
      }

      const quantityText = prompt(
        "Enter the updated total quantity for " + item.name,
        String(item.quantity)
      );

      if (quantityText === null) return;

      const weightText = prompt(
        "Enter the updated total weight in grams for " + item.name,
        String(item.weight_grams)
      );

      if (weightText === null) return;

      const quantity = Number(quantityText);
      const weight = Number(weightText);

      if (
        quantityText.trim() === "" ||
        !Number.isInteger(quantity) ||
        quantity < 0
      ) {
        toast("Enter a valid whole-number quantity.");
        return;
      }

      if (
        weightText.trim() === "" ||
        !Number.isFinite(weight) ||
        weight < 0
      ) {
        toast("Enter a valid weight.");
        return;
      }

      if (
        (quantity === 0 && weight !== 0) ||
        (quantity > 0 && weight <= 0)
      ) {
        toast("Quantity and weight must both be zero or both be positive.");
        return;
      }

      const decimalPart = weightText.split(".")[1];

      if (decimalPart && decimalPart.length > 3) {
        toast("Weight can have a maximum of 3 decimal places.");
        return;
      }

      const { error: updateError } = await VasundharaDB.update(
        "inventory",
        {
          quantity: quantity,
          weight_grams: weight,
          updated_at: new Date().toISOString()
        },
        {
          id: itemId
        }
      );

      if (updateError) throw updateError;

      toast("Inventory stock updated successfully.");
      await render("inventory");

    } catch (error) {
      console.error("Inventory update error:", error);
      toast("Unable to update inventory stock.");
    }

    return;
  }

  // Export inventory to CSV using Supabase data.
  if (event.target.id === "inventoryExport") {
    try {
      const { data: items, error } =
        await VasundharaDB.select("inventory");

      if (error) throw error;

      const headers = [
        "Item name",
        "Available quantity",
        "Total weight (grams)"
      ];

      const rows = (items || []).map(item => [
        item.name,
        item.quantity,
        item.weight_grams
      ]);

      const csv = [headers, ...rows]
        .map(row => row.map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(","))
        .join("\n");

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "inventory.csv";
      link.click();

      URL.revokeObjectURL(url);

      toast("Inventory CSV exported.");

    } catch (error) {
      console.error("Inventory export error:", error);
      toast("Unable to export inventory.");
    }
  }
});
