# SUS-SMS Platform

Stanbic-X Unified Stablecoin and Money Structure (SUS-SMS) platform demonstration.

## Prerequisites

- Node.js 18+
- PostgreSQL
- MetaMask (or another EVM wallet)

## Setup

1. **Environment Variables**
   Ensure you have a valid `.env` file at the root. You need a PostgreSQL connection URL:
   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/sus_sms?schema=public"
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Initialization**
   Apply the Prisma schema to your PostgreSQL database:
   ```bash
   npx prisma db push
   npx prisma generate
   ```

## Running the Application

Start the backend and frontend simultaneously:

1. **Backend Server** (Terminal 1)
   ```bash
   npm run server
   ```
   *Runs on http://localhost:4000*

2. **Frontend App** (Terminal 2)
   ```bash
   npm run dev
   ```
   *Runs on http://localhost:5173*

## B.11 End-to-End Workflow Demonstration

To test the complete workflow, open the frontend in your browser and follow these steps:

1. **STX Registration**
   - Click "Connect MetaMask".
   - You will be prompted to complete STX Registration (mocking biometric and passcode enrollment).
   - Click "Complete Registration". Your STX-ID and IMT-ID will be generated and associated with your wallet.

2. **Deposit**
   - In the "SUS Dashboard", choose a "Deposit chain" (Hoodi) and a "Principal stablecoin" (e.g., USDC).
   - Enter an amount (e.g., 100,000) and click "Deposit".
   - Your SUS balance will update to reflect the deposit.

3. **Allocate Cross-Chain**
   - In the "Allocation Interface", select "Base Sepolia" as the destination.
   - Select "DAI" as the output stablecoin.
   - Enter an allocation amount and click "Allocate through ACX".
   - The allocation status will show as `settling` and then update to `completed`.

4. **Verify Destination Balance**
   - Check the "Destination Balances" section.
   - You will see your DAI balance on Base Sepolia updated to the allocated amount.

5. **Withdraw**
   - In the "SUS Dashboard", click the "Withdraw" button (using the same amount input field).
   - Your SUS principal balance will decrease.

6. **Kill Switch & 3-of-3 Approval**
   - In the "Super Admin Controls" -> "Admin Dashboard", click "Activate Kill Switch (Pause)".
   - The platform will pause (verified in the "Security Dashboard").
   - A new pending operation for `kill_switch_deactivation` will appear in the Admin Dashboard.
   - Click "Approve" (simulating an admin approval). Once 3 approvals are met, the operation will execute, and the kill switch will deactivate.

---

*This is a demonstration for the SUS-SMS Architecture build.*
