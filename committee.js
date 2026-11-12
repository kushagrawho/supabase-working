
// ==========================================
// COMMITTEE MANAGEMENT
// Type B: Rotating Lottery Committee
// ==========================================

const COMMITTEE_STORAGE_KEY = "bizpilot_committees_v1";

// ---------- STORAGE ----------

function loadCommittees() {
    try {
        const records = JSON.parse(
            localStorage.getItem(COMMITTEE_STORAGE_KEY)
        ) || [];

        return Array.isArray(records) ? records : [];
    } catch (error) {
        console.error("Could not load committees:", error);
        return [];
    }
}

function saveCommittees(records) {
    localStorage.setItem(
        COMMITTEE_STORAGE_KEY,
        JSON.stringify(records)
    );
}

// ---------- HELPERS ----------

function committeeEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function committeeMoney(value) {
    return "₹" + (Number(value) || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function committeeToday() {
    const now = new Date();

    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
}

function committeeMonth(date) {
    return String(date || "").slice(0, 7);
}

// Normalize mobile numbers so spaces, +91 and formatting
// differences do not prevent a member from being found.
function committeeNormalizeMobile(value) {
    return String(value ?? "")
        .replace(/\D/g, "")
        .replace(/^91(?=\d{10}$)/, "");
}

// Unique IDs for every committee and member form.
function committeeFormSuffix(committeeId, mobile = "") {
    return String(`${committeeId}-${mobile}`)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function committeeCustomer(mobile) {
    try {
        const customers = JSON.parse(
            localStorage.getItem("bizpilot_customers_v1")
        ) || [];

        const target = committeeNormalizeMobile(mobile);

        return customers.find(customer =>
            committeeNormalizeMobile(customer.mobile) === target
        ) || null;

    } catch (error) {
        console.error("Could not find customer:", error);
        return null;
    }
}

function committeeAvailableAmount() {
    return loadCommittees().reduce((total, committee) => {
        if (committee.status !== "ongoing") return total;

        return total + (committee.members || []).reduce(
            (sum, member) =>
                sum + Math.max(0, Number(member.payoutRemaining) || 0),
            0
        );
    }, 0);
}

// ---------- CREATE COMMITTEE ----------

function createCommittee() {
    const name = document.getElementById("committeeName").value.trim();

    const memberCount = Number(
        document.getElementById("committeeMemberCount").value
    );

    const monthlyAmount = Number(
        document.getElementById("committeeMonthlyAmount").value
    );

    const startDate = document.getElementById("committeeStartDate").value;
    const endDate = document.getElementById("committeeEndDate").value;

    const dueDay = Number(
        document.getElementById("committeeDueDay").value
    );

    if (
        !name ||
        !Number.isInteger(memberCount) ||
        memberCount < 2 ||
        !Number.isFinite(monthlyAmount) ||
        monthlyAmount <= 0 ||
        !startDate ||
        !endDate ||
        endDate < startDate ||
        !Number.isInteger(dueDay) ||
        dueDay < 1 ||
        dueDay > 28
    ) {
        alert(
            "Please enter valid committee details. Member count must be at least 2, dates must be valid, and the due day must be between 1 and 28."
        );
        return;
    }

    const committees = loadCommittees();

    committees.push({
        id: "COM-" + Date.now(),
        name,
        memberCount,
        monthlyAmount,
        monthlyPool: memberCount * monthlyAmount,
        startDate,
        endDate,
        dueDay,
        status: "ongoing",
        members: [],
        payments: [],
        draws: [],
        usages: [],
        createdAt: new Date().toISOString()
    });

    saveCommittees(committees);
    renderCommitteePage();

    alert("Committee created. Now add its members.");
}

// ---------- ADD COMMITTEE MEMBER ----------

function addCommitteeMember(committeeId) {
    const suffix = committeeFormSuffix(committeeId);

    const input = document.getElementById(
        `committeeMemberMobile-${suffix}`
    );

    const mobile = String(input?.value || "").trim();
    const normalizedMobile = committeeNormalizeMobile(mobile);

    if (!normalizedMobile) {
        alert("Please enter the customer's mobile number.");
        return;
    }

    const customer = committeeCustomer(mobile);

    if (!customer) {
        alert(
            "This mobile number is not registered in Customer Management."
        );
        return;
    }

    const committees = loadCommittees();

    const committee = committees.find(
        item => String(item.id) === String(committeeId)
    );

    if (!committee) {
        alert("Committee not found.");
        return;
    }

    if (committee.status !== "ongoing") {
        alert("Members cannot be added to a closed committee.");
        return;
    }

    committee.members = committee.members || [];

    const alreadyExists = committee.members.some(member =>
        committeeNormalizeMobile(member.mobile) === normalizedMobile
    );

    if (alreadyExists) {
        alert("This customer is already a member of this committee.");
        return;
    }

    if (committee.members.length >= Number(committee.memberCount)) {
        alert("This committee already has all its members.");
        return;
    }

    committee.members.push({
        mobile: String(customer.mobile).trim(),
        name: customer.name,
        won: false,
        payoutTotal: 0,
        payoutUsed: 0,
        payoutRemaining: 0
    });

    saveCommittees(committees);
    renderCommitteePage();
}

// ---------- RECORD MONTHLY PAYMENT ----------

function recordCommitteePayment(committeeId, mobile) {
    const suffix = committeeFormSuffix(committeeId, mobile);

    const date = document.getElementById(
        `committeePaymentDate-${suffix}`
    )?.value;

    const month = document.getElementById(
        `committeePaymentMonth-${suffix}`
    )?.value;

    const amount = Number(
        document.getElementById(
            `committeePaymentAmount-${suffix}`
        )?.value
    );

    if (!date || !month || !Number.isFinite(amount) || amount <= 0) {
        alert("Please enter a valid payment date, month and amount.");
        return;
    }

    if (committeeMonth(date) !== month) {
        alert("The payment date must be in the selected payment month.");
        return;
    }

    const committees = loadCommittees();

    const committee = committees.find(
        item => String(item.id) === String(committeeId)
    );

    if (!committee || committee.status !== "ongoing") {
        alert("This committee is not active.");
        return;
    }

    committee.members = committee.members || [];

    const targetMobile = committeeNormalizeMobile(mobile);

    const member = committee.members.find(item =>
        committeeNormalizeMobile(item.mobile) === targetMobile
    );

    if (!member) {
        alert(
            "Committee member not found. Please refresh the page and try again."
        );
        return;
    }

    if (
        month < committeeMonth(committee.startDate) ||
        month > committeeMonth(committee.endDate)
    ) {
        alert("The selected month is outside this committee's date range.");
        return;
    }

    committee.payments = committee.payments || [];

    const alreadyPaid = committee.payments.some(payment =>
        committeeNormalizeMobile(payment.mobile) === targetMobile &&
        payment.month === month
    );

    if (alreadyPaid) {
        alert(
            "A payment is already recorded for this member for the selected month."
        );
        return;
    }

    if (amount !== Number(committee.monthlyAmount)) {
        alert(
            `The monthly payment must be exactly ${committeeMoney(committee.monthlyAmount)}.`
        );
        return;
    }

    committee.payments.push({
        id: "PAY-" + Date.now(),
        mobile: member.mobile,
        memberName: member.name,
        month,
        date,
        amount
    });

    saveCommittees(committees);
    renderCommitteePage();

    alert("Committee payment recorded.");
}

// ---------- RECORD MONTHLY WINNER ----------

function recordCommitteeWinner(committeeId) {
    const suffix = committeeFormSuffix(committeeId);

    const winnerMobile = document.getElementById(
        `committeeWinner-${suffix}`
    )?.value;

    const drawDate = document.getElementById(
        `committeeDrawDate-${suffix}`
    )?.value;

    const payoutAmount = Number(
        document.getElementById(
            `committeePayoutAmount-${suffix}`
        )?.value
    );

    if (
        !winnerMobile ||
        !drawDate ||
        !Number.isFinite(payoutAmount) ||
        payoutAmount <= 0
    ) {
        alert("Please select a winner, draw date and valid payout amount.");
        return;
    }

    const committees = loadCommittees();

    const committee = committees.find(
        item => String(item.id) === String(committeeId)
    );

    if (!committee || committee.status !== "ongoing") {
        alert("This committee is not active.");
        return;
    }

    committee.members = committee.members || [];
    committee.draws = committee.draws || [];

    if (committee.members.length !== Number(committee.memberCount)) {
        alert("Please add all committee members before recording a winner.");
        return;
    }

    if (drawDate < committee.startDate || drawDate > committee.endDate) {
        alert("The draw date must be within this committee's date range.");
        return;
    }

    if (
        committee.draws.some(
            draw => draw.month === committeeMonth(drawDate)
        )
    ) {
        alert(
            "A winner has already been recorded for this committee for this month."
        );
        return;
    }

    const targetMobile = committeeNormalizeMobile(winnerMobile);

    const winner = committee.members.find(member =>
        committeeNormalizeMobile(member.mobile) === targetMobile
    );

    if (!winner || winner.won) {
        alert("Choose a member who has not won this committee before.");
        return;
    }

    winner.won = true;
    winner.payoutTotal =
        (Number(winner.payoutTotal) || 0) + payoutAmount;

    winner.payoutRemaining =
        (Number(winner.payoutRemaining) || 0) + payoutAmount;

    committee.draws.push({
        id: "DRAW-" + Date.now(),
        month: committeeMonth(drawDate),
        date: drawDate,
        winnerMobile: winner.mobile,
        winnerName: winner.name,
        payoutAmount,
        payoutUsed: 0,
        payoutRemaining: payoutAmount
    });

    saveCommittees(committees);
    renderCommitteePage();

    alert("Committee winner and payout recorded.");
}

// ---------- RECORD PAYOUT USAGE ----------

function recordCommitteePayoutUsage(committeeId, mobile) {
    const suffix = committeeFormSuffix(committeeId, mobile);

    const amount = Number(
        document.getElementById(
            `committeeUsageAmount-${suffix}`
        )?.value
    );

    const date = document.getElementById(
        `committeeUsageDate-${suffix}`
    )?.value;

    const details = String(
        document.getElementById(
            `committeeUsageDetails-${suffix}`
        )?.value || ""
    ).trim();

    if (!date || !Number.isFinite(amount) || amount <= 0) {
        alert("Please enter a valid usage date and amount.");
        return;
    }

    const committees = loadCommittees();

    const committee = committees.find(
        item => String(item.id) === String(committeeId)
    );

    if (!committee || committee.status !== "ongoing") {
        alert("This committee is not active.");
        return;
    }

    committee.members = committee.members || [];
    committee.draws = committee.draws || [];

    const targetMobile = committeeNormalizeMobile(mobile);

    const member = committee.members.find(item =>
        committeeNormalizeMobile(item.mobile) === targetMobile
    );

    if (!member || !member.won) {
        alert("This member has no committee payout.");
        return;
    }

    if (amount > (Number(member.payoutRemaining) || 0)) {
        alert(
            "Usage cannot be greater than the member's unused payout."
        );
        return;
    }

    member.payoutUsed =
        (Number(member.payoutUsed) || 0) + amount;

    member.payoutRemaining =
        (Number(member.payoutRemaining) || 0) - amount;

    // Reduce the remaining amount from this member's latest
    // payout records first.
    let remainingToApply = amount;

    for (
        let i = committee.draws.length - 1;
        i >= 0 && remainingToApply > 0;
        i--
    ) {
        const draw = committee.draws[i];

        if (
            committeeNormalizeMobile(draw.winnerMobile) !== targetMobile ||
            Number(draw.payoutRemaining) <= 0
        ) {
            continue;
        }

        const applied = Math.min(
            Number(draw.payoutRemaining),
            remainingToApply
        );

        draw.payoutUsed =
            (Number(draw.payoutUsed) || 0) + applied;

        draw.payoutRemaining =
            Number(draw.payoutRemaining) - applied;

        remainingToApply -= applied;
    }

    committee.usages = committee.usages || [];

    committee.usages.push({
        id: "USE-" + Date.now(),
        mobile: member.mobile,
        memberName: member.name,
        date,
        amount,
        details
    });

    saveCommittees(committees);
    renderCommitteePage();

    alert("Payout usage recorded. Available committee amount has been reduced.");
}

// ---------- CLOSE COMMITTEE ----------

function closeCommittee(committeeId) {
    const committees = loadCommittees();

    const committee = committees.find(
        item => String(item.id) === String(committeeId)
    );

    if (!committee) return;

    const confirmed = confirm(
        "Close this committee? It will no longer accept payments or new winners. Any unused winner payout will remain recorded."
    );

    if (!confirmed) return;

    committee.status = "closed";
    committee.closedAt = committeeToday();

    saveCommittees(committees);
    renderCommitteePage();
}

// ---------- PAYMENT STATUS ----------

function committeePaymentStatus(committee, member, month) {
    const payment = (committee.payments || []).find(item =>
        committeeNormalizeMobile(item.mobile) ===
            committeeNormalizeMobile(member.mobile) &&
        item.month === month
    );

    if (payment) return "Paid";

    const dueDate =
        `${month}-${String(committee.dueDay).padStart(2, "0")}`;

    return committeeToday() > dueDate ? "Overdue" : "Due";
}

// ---------- COMMITTEE MONTHS ----------

function committeeMonths(committee) {
    const months = [];

    const start = new Date(committee.startDate + "T00:00:00");
    const end = new Date(committee.endDate + "T00:00:00");

    let year = start.getFullYear();
    let month = start.getMonth();

    while (
        year < end.getFullYear() ||
        (year === end.getFullYear() && month <= end.getMonth())
    ) {
        months.push(
            `${year}-${String(month + 1).padStart(2, "0")}`
        );

        month++;

        if (month > 11) {
            month = 0;
            year++;
        }
    }

    return months;
}

// ---------- SEARCH ----------

function committeeSearch() {
    const search = (
        document.getElementById("committeeSearch")?.value || ""
    ).toLowerCase().trim();

    document.querySelectorAll(".committee-member-card").forEach(card => {
        card.style.display =
            card.textContent.toLowerCase().includes(search) ? "" : "none";
    });
}

// ---------- RENDER COMMITTEE DETAILS ----------

function renderCommitteeDetails(committee) {
    committee.members = committee.members || [];
    committee.payments = committee.payments || [];
    committee.draws = committee.draws || [];

    const months = committeeMonths(committee);

    const currentAvailable = committee.members.reduce(
        (sum, member) =>
            sum + (Number(member.payoutRemaining) || 0),
        0
    );

    const committeeSuffix = committeeFormSuffix(committee.id);

    const memberCards = committee.members.map(member => {
        const suffix = committeeFormSuffix(
            committee.id,
            member.mobile
        );

        const paymentRows = months.map(month => {
            const status = committeePaymentStatus(
                committee,
                member,
                month
            );

            const payment = committee.payments.find(item =>
                committeeNormalizeMobile(item.mobile) ===
                    committeeNormalizeMobile(member.mobile) &&
                item.month === month
            );

            const statusClass =
                status === "Paid"
                    ? "paid"
                    : status === "Overdue"
                        ? "overdue"
                        : "due";

            return `
                <tr>
                    <td>${committeeEscape(month)}</td>
                    <td>${payment ? committeeMoney(payment.amount) : committeeMoney(0)}</td>
                    <td>
                        <span class="committee-status ${statusClass}">
                            ${status}
                        </span>
                    </td>
                    <td>${payment ? committeeEscape(payment.date) : "-"}</td>
                </tr>
            `;
        }).join("");

        return `
            <div class="committee-member-card">
                <div class="committee-member-heading">
                    <div>
                        <strong>${committeeEscape(member.name)}</strong>
                        <small>${committeeEscape(member.mobile)}</small>
                    </div>

                    <span class="committee-status ${member.won ? "paid" : "due"}">
                        ${member.won ? "Won" : "Not yet won"}
                    </span>
                </div>

                <p>
                    Monthly contribution:
                    <strong>${committeeMoney(committee.monthlyAmount)}</strong>
                </p>

                <p>Payout received: ${committeeMoney(member.payoutTotal)}</p>
                <p>Payout used: ${committeeMoney(member.payoutUsed)}</p>

                <p>
                    Unused payout:
                    <strong>${committeeMoney(member.payoutRemaining)}</strong>
                </p>

                ${committee.status === "ongoing" ? `
                    <div class="committee-inline-form">
                        <label>
                            Payment month
                            <input
                                type="month"
                                id="committeePaymentMonth-${suffix}"
                                value="${committeeEscape(committeeMonth(committeeToday()))}"
                            >
                        </label>

                        <label>
                            Payment date
                            <input
                                type="date"
                                id="committeePaymentDate-${suffix}"
                                value="${committeeToday()}"
                            >
                        </label>

                        <label>
                            Amount
                            <input
                                type="number"
                                id="committeePaymentAmount-${suffix}"
                                min="0.01"
                                step="0.01"
                                value="${Number(committee.monthlyAmount)}"
                            >
                        </label>

                        <button onclick="recordCommitteePayment('${committeeEscape(committee.id)}', '${committeeEscape(member.mobile)}')">
                            Record Monthly Payment
                        </button>
                    </div>

                    ${member.won && Number(member.payoutRemaining) > 0 ? `
                        <div class="committee-inline-form">
                            <label>
                                Usage date
                                <input
                                    type="date"
                                    id="committeeUsageDate-${suffix}"
                                    value="${committeeToday()}"
                                >
                            </label>

                            <label>
                                Amount used
                                <input
                                    type="number"
                                    id="committeeUsageAmount-${suffix}"
                                    min="0.01"
                                    max="${Number(member.payoutRemaining)}"
                                    step="0.01"
                                    placeholder="Enter amount"
                                >
                            </label>

                            <label>
                                Purchase details
                                <input
                                    type="text"
                                    id="committeeUsageDetails-${suffix}"
                                    placeholder="Optional purchase details"
                                >
                            </label>

                            <button onclick="recordCommitteePayoutUsage('${committeeEscape(committee.id)}', '${committeeEscape(member.mobile)}')">
                                Record Payout Usage
                            </button>
                        </div>
                    ` : ""}
                ` : ""}

                <details>
                    <summary>Monthly payment history</summary>

                    <div class="committee-table-wrap">
                        <table class="committee-table">
                            <thead>
                                <tr>
                                    <th>Month</th>
                                    <th>Paid</th>
                                    <th>Status</th>
                                    <th>Payment date</th>
                                </tr>
                            </thead>

                            <tbody>
                                ${paymentRows}
                            </tbody>
                        </table>
                    </div>
                </details>
            </div>
        `;
    }).join("");

    const eligibleMembers = committee.members.filter(
        member => !member.won
    );

    const drawRows = committee.draws.map(draw => `
        <tr>
            <td>${committeeEscape(draw.date)}</td>
            <td>${committeeEscape(draw.winnerName)}</td>
            <td>${committeeMoney(draw.payoutAmount)}</td>
            <td>${committeeMoney(draw.payoutUsed)}</td>
            <td>${committeeMoney(draw.payoutRemaining)}</td>
        </tr>
    `).join("");

    return `
        <section class="committee-section">

            <div class="committee-detail-heading">
                <div>
                    <h3>${committeeEscape(committee.name)}</h3>

                    <p>
                        ${committee.members.length}/${committee.memberCount} members ·
                        ${committeeEscape(committee.startDate)} to
                        ${committeeEscape(committee.endDate)}
                    </p>
                </div>

                <span class="committee-status ${committee.status === "ongoing" ? "paid" : "overdue"}">
                    ${committee.status === "ongoing" ? "Ongoing" : "Closed"}
                </span>
            </div>

            <div class="committee-summary">
                <div>
                    <small>Monthly per member</small>
                    <strong>${committeeMoney(committee.monthlyAmount)}</strong>
                </div>

                <div>
                    <small>Monthly pool</small>
                    <strong>${committeeMoney(committee.monthlyPool)}</strong>
                </div>

                <div>
                    <small>Winners recorded</small>
                    <strong>${committee.draws.length}</strong>
                </div>

                <div>
                    <small>Unused payouts</small>
                    <strong>${committeeMoney(currentAvailable)}</strong>
                </div>
            </div>

            ${committee.status === "ongoing" &&
                committee.members.length < committee.memberCount ? `
                <div class="committee-inline-form">
                    <label>
                        Add member by customer mobile
                        <input
                            type="text"
                            id="committeeMemberMobile-${committeeSuffix}"
                            placeholder="Registered customer mobile"
                        >
                    </label>

                    <button onclick="addCommitteeMember('${committeeEscape(committee.id)}')">
                        Add Member
                    </button>
                </div>
            ` : ""}

            ${committee.status === "ongoing" &&
                eligibleMembers.length > 0 &&
                committee.members.length === committee.memberCount ? `

                <div class="committee-section-inner">
                    <h4>Record Monthly Winner</h4>

                    <div class="committee-inline-form">
                        <label>
                            Winner
                            <select id="committeeWinner-${committeeSuffix}">
                                <option value="">Select member</option>

                                ${eligibleMembers.map(member => `
                                    <option value="${committeeEscape(member.mobile)}">
                                        ${committeeEscape(member.name)}
                                        (${committeeEscape(member.mobile)})
                                    </option>
                                `).join("")}
                            </select>
                        </label>

                        <label>
                            Draw date
                            <input
                                type="date"
                                id="committeeDrawDate-${committeeSuffix}"
                                value="${committeeToday()}"
                            >
                        </label>

                        <label>
                            Payout amount
                            <input
                                type="number"
                                id="committeePayoutAmount-${committeeSuffix}"
                                min="0.01"
                                step="0.01"
                                value="${Number(committee.monthlyPool)}"
                            >
                        </label>

                        <button onclick="recordCommitteeWinner('${committeeEscape(committee.id)}')">
                            Record Winner &amp; Payout
                        </button>
                    </div>
                </div>
            ` : ""}

            <h4>Members and Monthly Payments</h4>

            <div class="committee-member-list">
                ${memberCards || "<p>No members added yet.</p>"}
            </div>

            <h4>Winner and Payout History</h4>

            <div class="committee-table-wrap">
                <table class="committee-table">
                    <thead>
                        <tr>
                            <th>Draw date</th>
                            <th>Winner</th>
                            <th>Payout</th>
                            <th>Used</th>
                            <th>Unused</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${drawRows || '<tr><td colspan="5">No winners recorded yet.</td></tr>'}
                    </tbody>
                </table>
            </div>

            ${committee.status === "ongoing" ? `
                <button
                    class="committee-close-button"
                    onclick="closeCommittee('${committeeEscape(committee.id)}')"
                >
                    Close Committee
                </button>
            ` : ""}

        </section>
    `;
}

// ---------- MAIN COMMITTEE PAGE ----------

function renderCommitteePage() {
    const main = document.querySelector("main");

    if (!main) {
        console.error("Main content container not found.");
        return;
    }

    const committees = loadCommittees();

    const ongoing = committees.filter(
        item => item.status === "ongoing"
    );

    const totalMembers = ongoing.reduce(
        (sum, item) => sum + (item.members || []).length,
        0
    );

    const monthlyCollection = ongoing.reduce(
        (sum, item) =>
            sum + Number(item.memberCount) * Number(item.monthlyAmount),
        0
    );

    const totalPayouts = committees.reduce(
        (sum, item) => sum + (item.draws || []).reduce(
            (drawSum, draw) =>
                drawSum + (Number(draw.payoutAmount) || 0),
            0
        ),
        0
    );

    const overdueCount = ongoing.reduce((sum, committee) => {
        const currentMonth = committeeMonth(committeeToday());

        if (
            currentMonth < committeeMonth(committee.startDate) ||
            currentMonth > committeeMonth(committee.endDate)
        ) {
            return sum;
        }

        return sum + (committee.members || []).filter(member =>
            committeePaymentStatus(
                committee,
                member,
                currentMonth
            ) === "Overdue"
        ).length;

    }, 0);

    main.innerHTML = `
        <div class="committee-page">

            <h2>Committee Management</h2>

            <p>
                Manage rotating monthly committees, member payments
                and winner payouts.
            </p>

            <div class="committee-overview">

                <div>
                    <small>Ongoing committees</small>
                    <strong>${ongoing.length}</strong>
                </div>

                <div>
                    <small>Total members</small>
                    <strong>${totalMembers}</strong>
                </div>

                <div>
                    <small>Monthly collection plan</small>
                    <strong>${committeeMoney(monthlyCollection)}</strong>
                </div>

                <div>
                    <small>Total payouts</small>
                    <strong>${committeeMoney(totalPayouts)}</strong>
                </div>

                <div>
                    <small>Available committee amount</small>
                    <strong>${committeeMoney(committeeAvailableAmount())}</strong>
                </div>

                <div>
                    <small>Overdue members</small>
                    <strong>${overdueCount}</strong>
                </div>

            </div>

            <section class="committee-section">

                <h3>Create New Committee</h3>

                <div class="committee-form-grid">

                    <label>
                        Committee name
                        <input
                            type="text"
                            id="committeeName"
                            placeholder="Enter committee name"
                        >
                    </label>

                    <label>
                        Number of members
                        <input
                            type="number"
                            id="committeeMemberCount"
                            min="2"
                            step="1"
                            placeholder="e.g. 10"
                        >
                    </label>

                    <label>
                        Monthly amount per member (₹)
                        <input
                            type="number"
                            id="committeeMonthlyAmount"
                            min="0.01"
                            step="0.01"
                            placeholder="e.g. 500"
                        >
                    </label>

                    <label>
                        Monthly due day (1–28)
                        <input
                            type="number"
                            id="committeeDueDay"
                            min="1"
                            max="28"
                            value="10"
                        >
                    </label>

                    <label>
                        Start date
                        <input type="date" id="committeeStartDate">
                    </label>

                    <label>
                        End date
                        <input type="date" id="committeeEndDate">
                    </label>

                </div>

                <button onclick="createCommittee()">
                    Create Committee
                </button>

            </section>

            <section class="committee-section">

                <div class="committee-list-heading">

                    <h3>Your Committees</h3>

                    <input
                        type="text"
                        id="committeeSearch"
                        placeholder="Search members by name or mobile"
                        oninput="committeeSearch()"
                    >

                </div>

                ${
                    committees.length
                        ? committees.map(committee =>
                            renderCommitteeDetails(committee)
                        ).join("")
                        : "<p>No committees created yet.</p>"
                }

            </section>

        </div>
    `;
}
