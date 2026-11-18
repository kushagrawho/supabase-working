
// ==========================================
// COMMITTEE MANAGEMENT
// Type B: Rotating Lottery Committee
// ==========================================

let committeeCache = [];

async function loadCommitteesFromSupabase() {
    const [
        committeesResult,
        membersResult,
        paymentsResult,
        drawsResult,
        usagesResult
    ] = await Promise.all([
        VasundharaDB.select("committees"),
        VasundharaDB.select("committee_members"),
        VasundharaDB.select("committee_payments"),
        VasundharaDB.select("committee_draws"),
        VasundharaDB.select("committee_usages")
    ]);

    const results = [
        committeesResult,
        membersResult,
        paymentsResult,
        drawsResult,
        usagesResult
    ];

    const failed = results.find(result => result.error);

    if (failed) {
        throw failed.error;
    }

    const committees = committeesResult.data || [];
    const members = membersResult.data || [];
    const payments = paymentsResult.data || [];
    const draws = drawsResult.data || [];
    const usages = usagesResult.data || [];

    return committees.map(committee => {
        const committeeMembers = members.filter(
            member => member.committee_id === committee.id
        );

        return {
            id: committee.committee_id,
            dbId: committee.id,
            name: committee.name,
            memberCount: committee.member_count,
            monthlyAmount: Number(committee.monthly_amount),
            monthlyPool: Number(committee.monthly_pool),
            startDate: committee.start_date,
            endDate: committee.end_date,
            dueDay: committee.due_day,
            status: committee.status,
            createdAt: committee.created_at,
            closedAt: committee.closed_at,

            members: committeeMembers.map(member => ({
                mobile: member.mobile,
                name: member.name,
                won: member.won,
                payoutTotal: Number(member.payout_total),
                payoutUsed: Number(member.payout_used),
                payoutRemaining: Number(member.payout_remaining)
            })),

            payments: payments
                .filter(payment => payment.committee_id === committee.id)
                .map(payment => ({
                    mobile: payment.mobile,
                    memberName: payment.member_name,
                    month: payment.month,
                    date: payment.date,
                    amount: Number(payment.amount)
                })),

            draws: draws
                .filter(draw => draw.committee_id === committee.id)
                .map(draw => ({
                    month: draw.month,
                    date: draw.date,
                    winnerMobile: draw.winner_mobile,
                    winnerName: draw.winner_name,
                    payoutAmount: Number(draw.payout_amount),
                    payoutUsed: Number(draw.payout_used),
                    payoutRemaining: Number(draw.payout_remaining)
                })),

            usages: usages
                .filter(usage => usage.committee_id === committee.id)
                .map(usage => ({
                    mobile: usage.mobile,
                    memberName: usage.member_name,
                    date: usage.date,
                    amount: Number(usage.amount),
                    details: usage.details
                }))
        };
    });
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

function committeeAvailableAmount(committees = committeeCache) {
    return committees.reduce((total, committee) => {
        if (committee.status !== "ongoing") return total;

        return total + (committee.members || []).reduce(
            (sum, member) =>
                sum + Math.max(0, Number(member.payoutRemaining) || 0),
            0
        );
    }, 0);
}


// ---------- CREATE COMMITTEE ----------

async function createCommittee() {
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

    const committeeId = "COM-" + Date.now();

    const { data, error } = await VasundharaDB.insert("committees", {
        committee_id: committeeId,
        name,
        member_count: memberCount,
        monthly_amount: monthlyAmount,
        monthly_pool: memberCount * monthlyAmount,
        start_date: startDate,
        end_date: endDate,
        due_day: dueDay,
        status: "ongoing"
    });

    if (error) {
        console.error("Error creating committee:", error);
        alert("Could not create committee. Please try again.");
        return;
    }

    await render("committee");
    alert("Committee created. Now add its members.");
}


// ---------- ADD COMMITTEE MEMBER ----------

async function addCommitteeMember(committeeId) {
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

    const { data: customers, error: customerError } =
        await VasundharaDB.select("customers");

    if (customerError) {
        console.error("Error loading customer:", customerError);
        alert("Could not verify the customer. Please try again.");
        return;
    }

    const customer = (customers || []).find(item =>
        committeeNormalizeMobile(item.mobile) === normalizedMobile
    );

    if (!customer) {
        alert(
            "This mobile number is not registered in Customer Management."
        );
        return;
    }

    const committee = committeeCache.find(
        item => String(item.id) === String(committeeId)
    );

    if (!committee) {
        alert("Committee not found. Please refresh the page.");
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

    const { error } = await VasundharaDB.insert("committee_members", {
        committee_id: committee.dbId,
        mobile: String(customer.mobile).trim(),
        name: customer.name,
        won: false,
        payout_total: 0,
        payout_used: 0,
        payout_remaining: 0
    });

    if (error) {
        console.error("Error adding committee member:", error);
        alert("Could not add this member. Please try again.");
        return;
    }

    await render("committee");
}


// ---------- RECORD MONTHLY PAYMENT ----------

async function recordCommitteePayment(committeeId, mobile) {
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

    const committee = committeeCache.find(
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

    const { error } = await VasundharaDB.insert("committee_payments", {
        committee_id: committee.dbId,
        mobile: member.mobile,
        member_name: member.name,
        month,
        date,
        amount
    });

    if (error) {
        console.error("Error recording committee payment:", error);
        alert("Could not record committee payment. Please try again.");
        return;
    }

    await render("committee");
    alert("Committee payment recorded.");
}


// ---------- RECORD MONTHLY WINNER ----------

async function recordCommitteeWinner(committeeId) {
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

    const committee = committeeCache.find(
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

    const { error } = await VasundharaDB.rpc(
        "record_committee_winner",
        {
            p_committee_id: committee.dbId,
            p_winner_mobile: winner.mobile,
            p_draw_date: drawDate,
            p_payout_amount: payoutAmount
        }
    );

    if (error) {
        console.error("Error recording committee winner:", error);
        alert(error.message || "Could not record the committee winner.");
        return;
    }

    await render("committee");
    alert("Committee winner recorded successfully.");
}


// ---------- RECORD PAYOUT USAGE ----------

async function recordCommitteePayoutUsage(committeeId, mobile) {
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

    const committee = committeeCache.find(
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

    const { error } = await VasundharaDB.rpc(
        "record_committee_payout_usage",
        {
            p_committee_id: committee.dbId,
            p_mobile: member.mobile,
            p_date: date,
            p_amount: amount,
            p_details: details
        }
    );

    if (error) {
        console.error("Error recording payout usage:", error);
        alert(error.message || "Could not record payout usage.");
        return;
    }

    await render("committee");
    alert("Payout usage recorded successfully.");
}


// ---------- CLOSE COMMITTEE ----------

async function closeCommittee(committeeId) {
    const committee = committeeCache.find(
        item => String(item.id) === String(committeeId)
    );

    if (!committee) return;

    const confirmed = confirm(
        "Close this committee? It will no longer accept payments or new winners. Any unused winner payout will remain recorded."
    );

    if (!confirmed) return;

    const { error } = await VasundharaDB.update(
        "committees",
        {
            status: "closed",
            closed_at: committeeToday()
        },
        { id: committee.dbId }
    );

    if (error) {
        console.error("Error closing committee:", error);
        alert(error.message || "Could not close committee.");
        return;
    }

    await render("committee");
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

async function renderCommitteePage() {
    const committees = await loadCommitteesFromSupabase();
    committeeCache = committees;

    const ongoing = committees.filter(c => c.status === "ongoing");

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

    return `
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
