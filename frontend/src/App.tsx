import { FileQuestion } from "lucide-react";
import { Link, Route, Routes } from "react-router";
import { DashboardLayout, PublicLayout } from "@/components/layout/Layouts";
import { RequireRole } from "@/components/RequireRole";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import CampaignMonitoring from "@/pages/admin/CampaignMonitoring";
import { NgoManagement, VerifierManagement } from "@/pages/admin/RoleManagement";
import Login from "@/pages/auth/Login";
import DonationDetail from "@/pages/donor/DonationDetail";
import DonorDashboard from "@/pages/donor/DonorDashboard";
import MyDonations from "@/pages/donor/MyDonations";
import CampaignDonations from "@/pages/ngo/CampaignDonations";
import CreateCampaign from "@/pages/ngo/CreateCampaign";
import ManageCampaign from "@/pages/ngo/ManageCampaign";
import ManageMilestones from "@/pages/ngo/ManageMilestones";
import NgoDashboard from "@/pages/ngo/NgoDashboard";
import SubmitEvidence from "@/pages/ngo/SubmitEvidence";
import PendingReviews from "@/pages/verifier/PendingReviews";
import ReviewDetail from "@/pages/verifier/ReviewDetail";
import VerificationHistory from "@/pages/verifier/VerificationHistory";
import VerifierDashboard from "@/pages/verifier/VerifierDashboard";
import Register from "@/pages/auth/Register";
import CampaignDetail from "@/pages/public/CampaignDetail";
import Campaigns from "@/pages/public/Campaigns";
import Landing from "@/pages/public/Landing";
import Transaction from "@/pages/public/Transaction";
import Transparency from "@/pages/public/Transparency";

function NotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Page not found"
      description="The page you are looking for does not exist."
      action={<Link to="/" className={buttonClass("outline")}>Go home</Link>}
      className="py-24"
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="campaigns/:id/transparency" element={<Transparency />} />
        <Route path="tx/:hash" element={<Transaction />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<DashboardLayout />}>
        <Route element={<RequireRole role="DONOR" />}>
          <Route path="donor" element={<DonorDashboard />} />
          <Route path="donor/donations" element={<MyDonations />} />
          <Route path="donor/donations/:txHash" element={<DonationDetail />} />
        </Route>
        <Route element={<RequireRole role="NGO" />}>
          <Route path="ngo" element={<NgoDashboard />} />
          <Route path="ngo/campaigns/new" element={<CreateCampaign />} />
          <Route path="ngo/campaigns/:id" element={<ManageCampaign />} />
          <Route path="ngo/campaigns/:id/milestones" element={<ManageMilestones />} />
          <Route path="ngo/campaigns/:id/milestones/:mid/evidence" element={<SubmitEvidence />} />
          <Route path="ngo/campaigns/:id/donations" element={<CampaignDonations />} />
        </Route>
        <Route element={<RequireRole role="VERIFIER" />}>
          <Route path="verifier" element={<VerifierDashboard />} />
          <Route path="verifier/pending" element={<PendingReviews />} />
          <Route path="verifier/review/:campaignId/:milestoneId" element={<ReviewDetail />} />
          <Route path="verifier/history" element={<VerificationHistory />} />
        </Route>
        <Route element={<RequireRole role="ADMIN" />}>
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="admin/ngos" element={<NgoManagement />} />
          <Route path="admin/verifiers" element={<VerifierManagement />} />
          <Route path="admin/campaigns" element={<CampaignMonitoring />} />
        </Route>
      </Route>
    </Routes>
  );
}
