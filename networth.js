
// ==========================================
// NET WORTH DASHBOARD
// ==========================================

const NETWORTH_INVENTORY_KEY = "bizpilot_inventory_v1";
const NETWORTH_JAMA_KEY = "bizpilot_jama_udhar_v1";
const NETWORTH_COMMITTEE_KEY = "bizpilot_committees_v1";


// Safely read records from localStorage
function netWorthReadStorage(key) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Could not read storage:", key, error);
        return [];
    }
}


// Format money
function netWorthMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


// Format weight
function netWorthWeight(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
    }) + " g";
}


// Current month in YYYY-MM format
function netWorthCurrentMonth() {
    const now = new Date();

    return now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0");
}


// ==========================================
// INVENTORY WEIGHT
// ==========================================

function netWorthGetInventoryWeight() {
    const inventory = netWorthReadStorage(NETWORTH_INVENTORY_KEY);

    return inventory.reduce((total, item) => {
        return total + Math.max(
            0,
            Number(item.weightGrams) || 0
        );
    }, 0);
}


// ==========================================
// JAMA AND UDHAR
// ==========================================

function netWorthGetJamaUdhaar() {
    const records = netWorthReadStorage(NETWORTH_JAMA_KEY);

    return records.reduce((totals, record) => {
        const remaining = Math.max(
            0,
            Number(record.remainingAmount) || 0
        );

        if (record.type === "jama") {
            totals.jama += remaining;
        }

        if (record.type === "udhar") {
            totals.udhar += remaining;
        }

        return totals;
    }, {
        jama: 0,
        udhar: 0
    });
}


// ==========================================
// COMMITTEE CALCULATIONS
// ==========================================

function netWorthGetCommitteeDetails() {
    const committees = netWorthReadStorage(NETWORTH_COMMITTEE_KEY);

    const currentMonth = netWorthCurrentMonth();

    let monthlyExpected = 0;
    let monthlyReceived = 0;
    let monthlyReceivable = 0;
    let unusedPayouts = 0;

    committees.forEach(committee => {

        // Only ongoing committees are included
        if (committee.status !== "ongoing") {
            return;
        }

        const startMonth = String(committee.startDate || "").slice(0, 7);
        const endMonth = String(committee.endDate || "").slice(0, 7);

        // Count monthly contributions only during the committee period
        const isCurrentMonthActive =
            startMonth &&
            endMonth &&
            currentMonth >= startMonth &&
            currentMonth <= endMonth;

        if (isCurrentMonthActive) {

            // Expected contribution from all committee members
            const expectedForCommittee =
                Number(committee.memberCount || 0) *
                Number(committee.monthlyAmount || 0);

            monthlyExpected += expectedForCommittee;

            // Count contributions already paid this month
            (committee.payments || []).forEach(payment => {
                if (String(payment.month) === currentMonth) {
                    monthlyReceived += Math.max(
                        0,
                        Number(payment.amount) || 0
                    );
                }
            });
        }

        // Unused payouts are money owed to committee winners
        (committee.members || []).forEach(member => {
            unusedPayouts += Math.max(
                0,
                Number(member.payoutRemaining) || 0
            );
        });
    });

    // Do not allow received amount to exceed expected amount
    monthlyReceived = Math.min(monthlyReceived, monthlyExpected);

    monthlyReceivable = Math.max(
        0,
        monthlyExpected - monthlyReceived
    );

    return {
        monthlyExpected,
        monthlyReceived,
        monthlyReceivable,
        unusedPayouts
    };
}


// ==========================================
// CASH AND BANK
// ==========================================

function netWorthGetCashBank() {
    if (typeof getCashBalances !== "function") {
        console.error(
            "getCashBalances() was not found. Check cash.js loading order."
        );

        return {
            cash: 0,
            bank: 0
        };
    }

    const balances = getCashBalances() || {};

    return {
        cash: Number(
            balances.cash ??
            balances.cashBalance ??
            balances.cashInHand ??
            balances.cash_balance ??
            0
        ) || 0,

        bank: Number(
            balances.bank ??
            balances.bankBalance ??
            balances.bankTotal ??
            balances.bank_balance ??
            0
        ) || 0
    };
}


// ==========================================
// COMPLETE NET WORTH
// ==========================================

function calculateNetWorth() {
    const inventoryWeight = netWorthGetInventoryWeight();
    const cashBank = netWorthGetCashBank();
    const jamaUdhaar = netWorthGetJamaUdhaar();
    const committee = netWorthGetCommitteeDetails();

    const netWorth =
        cashBank.cash +
        cashBank.bank +
        jamaUdhaar.udhar -
        jamaUdhaar.jama +
        committee.monthlyReceivable -
        committee.unusedPayouts;

    return {
        inventoryWeight,

        cash: cashBank.cash,
        bank: cashBank.bank,

        udhar: jamaUdhaar.udhar,
        jama: jamaUdhaar.jama,

        committeeExpected: committee.monthlyExpected,
        committeeReceived: committee.monthlyReceived,
        committeeReceivable: committee.monthlyReceivable,
        committeeLiability: committee.unusedPayouts,

        netWorth
    };
}


// ==========================================
// RENDER NET WORTH PAGE
// ==========================================

function renderNetWorthPage() {
    const main = document.querySelector("main");

    if (!main) {
        console.error("Main content container not found.");
        return;
    }

    const data = calculateNetWorth();

    main.innerHTML = `
        <div class="networth-page">

            <div class="panel">
                <div class="panel-head">
                    <div>
                        <h2>Net Worth Dashboard</h2>
                        <p class="panel-sub">
                            Your current business financial position.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="small-button"
                        onclick="renderNetWorthPage()"
                    >
                        ↻ Refresh
                    </button>
                </div>

                <div class="networth-highlight">
                    <small>Estimated Financial Net Worth</small>
                    <h1>${netWorthMoney(data.netWorth)}</h1>
                    <p>
                        Cash + Bank + Udhaar − Jama
                        + Committee Receivable − Committee Liability
                    </p>
                </div>
            </div>


            <div class="panel">
                <h3>Inventory Weight</h3>

                <div class="networth-weight-card">
                    <span>Total remaining inventory weight</span>
                    <strong>${netWorthWeight(data.inventoryWeight)}</strong>
                </div>

                <p class="panel-sub">
                    Combined remaining weight of all inventory items.
                    Inventory weight is shown separately and is not
                    converted into money.
                </p>
            </div>


            <div class="panel">
                <h3>Financial Assets</h3>

                <div class="networth-breakdown">

                    <div class="networth-row">
                        <div>
                            <strong>Cash in Hand</strong>
                            <small>Available physical cash (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.cash)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Bank Balance</strong>
                            <small>Available bank balance (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.bank)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Outstanding Udhaar</strong>
                            <small>Money customers owe you (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.udhar)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Unpaid Committee Contributions</strong>
                            <small>Current month's contributions still to receive (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeReceivable)}</strong>
                    </div>

                </div>
            </div>


            <div class="panel">
                <h3>Financial Liabilities</h3>

                <div class="networth-breakdown">

                    <div class="networth-row">
                        <div>
                            <strong>Outstanding Jama</strong>
                            <small>Advance payments and Jama balance (−)</small>
                        </div>
                        <strong>− ${netWorthMoney(data.jama)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Unused Committee Payouts</strong>
                            <small>Money still owed to committee winners (−)</small>
                        </div>
                        <strong>− ${netWorthMoney(data.committeeLiability)}</strong>
                    </div>

                </div>
            </div>


            <div class="panel">
                <h3>Committee Monthly Collection</h3>

                <div class="networth-breakdown">

                    <div class="networth-row">
                        <div>
                            <strong>Expected This Month</strong>
                            <small>Total monthly contribution of ongoing committees</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeExpected)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Already Received</strong>
                            <small>Payments recorded in Committee Management</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeReceived)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Still To Receive</strong>
                            <small>Unpaid monthly contributions added to net worth</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeReceivable)}</strong>
                    </div>

                </div>
            </div>


            <div class="panel">
                <div class="networth-total-row">
                    <strong>Financial Net Worth</strong>
                    <strong>${netWorthMoney(data.netWorth)}</strong>
                </div>

                <p class="panel-sub">
                    Inventory weight is not included in this rupee calculation.
                    Committee contributions already received are reflected
                    through Cash/Bank balances, not counted twice.
                </p>
            </div>

        </div>
    `;
}
