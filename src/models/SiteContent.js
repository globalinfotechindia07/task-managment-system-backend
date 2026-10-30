const mongoose = require('mongoose');

const statItemSchema = mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true }
  },
  { _id: false }
);

const testimonialSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    designation: { type: String, default: '' },
    company: { type: String, default: '' },
    rating: { type: Number, default: 5 },
    review: { type: String, required: true },
    avatar: { type: String, default: '' }
  },
  { _id: false }
);

const siteContentSchema = mongoose.Schema(
  {
    hero: {
      badge: { type: String, default: 'Unified SaaS Enterprise Workspace' },
      title: { type: String, default: 'Intelligent Company & Multi-Branch' },
      highlight: { type: String, default: 'Management Platform' },
      subtitle: {
        type: String,
        default:
          'Streamline attendance with geofencing, daily task workflows, automated dynamic salary slips, secure team chat, and multi-office tenant segregation in one unified cloud system.'
      },
      primaryCta: { type: String, default: 'Explore Subscription Plans' },
      secondaryCta: { type: String, default: 'Access Portal' }
    },
    aboutUs: {
      badge: { type: String, default: 'About Global Infotech' },
      title: { type: String, default: 'Empowering Modern Enterprises with Scalable Cloud Infrastructure' },
      description: {
        type: String,
        default:
          'We engineer future-ready enterprise management solutions that simplify workforce operations, automate compliance, and give business leaders complete transparency across distributed branches.'
      },
      mission: {
        type: String,
        default: 'To provide high-performance, intuitive, and secure management software tailored for high-growth businesses.'
      },
      vision: {
        type: String,
        default: 'To be the trusted multi-tenant operating system for global enterprises and distributed workplaces.'
      },
      imageUrl: {
        type: String,
        default: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80'
      },
      stats: {
        type: [statItemSchema],
        default: () => [
          { label: 'Enterprises & Offices', value: '500+' },
          { label: 'Active Employees Managed', value: '25,000+' },
          { label: 'Salary Slips Disbursed', value: '₹120M+' },
          { label: 'Platform Uptime', value: '99.98%' }
        ]
      }
    },
    contactInfo: {
      title: { type: String, default: 'Let’s Discuss Your Enterprise Needs' },
      description: {
        type: String,
        default:
          'Have questions about onboarding, custom integrations, or multi-branch deployments? Our technical team is here to assist.'
      },
      email: { type: String, default: 'contact@globalinfotech.com' },
      phone: { type: String, default: '+91 98765 43210' },
      address: { type: String, default: 'Global Infotech Towers, IT Park, Powai, Mumbai - 400076' },
      supportHours: { type: String, default: 'Monday - Saturday: 9:00 AM - 7:00 PM IST' }
    },
    termsAndConditions: {
      content: {
        type: String,
        default: `### 1. Acceptance of Terms
By accessing or using our SaaS Multi-Tenant Platform, you agree to comply with and be bound by these Terms and Conditions.

### 2. Multi-Tenant Accounts & Subscriptions
Each registered office or enterprise operates on a provisioned tenant environment with fixed employee quotas according to the chosen subscription plan. Payment is required prior to service provisioning.

### 3. Data Isolation and Security
We implement strict cryptographic and database-level isolation between organizations. Tenant data is never shared across offices.

### 4. Cancellation & Expiration
Accounts that remain expired or suspended may experience restricted portal access until renewed.`
      },
      lastUpdated: { type: Date, default: Date.now }
    },
    privacyPolicy: {
      content: {
        type: String,
        default: `### 1. Information Collection
We collect account information including name, official email, phone number, and branch details necessary for authentication and payroll generation.

### 2. Geofence & Location Data
Location coordinates captured during punch-in/out are exclusively utilized to enforce office perimeter attendance policy and are not tracked outside attendance events.

### 3. Financial and Payroll Data
Salary breakups, CTC annexures, and deduction structures are encrypted and accessible strictly by authorized office administration and respective employees.

### 4. Third-Party Disclosures
We never sell, distribute, or share tenant employee records with external advertising vendors.`
      },
      lastUpdated: { type: Date, default: Date.now }
    },
    paymentPolicy: {
      content: {
        type: String,
        default: `### 1. Payment Terms & Billing
All subscription plan purchases are billed in advance on a recurring monthly or annual basis, as selected by the client organization.

### 2. Supported Payment Methods
We support secure transactions via Razorpay, including Credit/Debit Cards (Visa, MasterCard, RuPay), Unified Payments Interface (UPI), Net Banking, and corporate wallets.

### 3. Taxation & GST Invoices
All plan prices listed are exclusive of applicable GST (18%). Official GST tax invoices will be generated and dispatched to the registered office email upon successful transaction completion.

### 4. Renewal & Plan Upgrades
Subscribers will receive automated renewal notifications 7 days prior to plan expiry. Organizations can upgrade employee quotas or tier levels at any time on a pro-rata basis.`
      },
      lastUpdated: { type: Date, default: Date.now }
    },
    refundPolicy: {
      content: {
        type: String,
        default: `### 1. 7-Day Refund Policy
We offer a 7-day money-back guarantee for initial subscription purchases if our software fails to meet your organization's documented technical specifications.

### 2. Refund Eligibility & Request Process
To initiate a refund request, the authorized company admin must submit a request to **contact@globalinfotech.com** from their registered email within 7 calendar days of plan activation.

### 3. Processing Timeline
Approved refunds are processed through our payment gateway partner (Razorpay) and credited back to the original source of payment within **5 to 7 business days**.

### 4. Non-Refundable Items
Renewal fees after the initial 7-day term, custom software development fees, and active accounts exceeding 7 days of operational usage are non-refundable.

### 5. Service Cancellation
You may cancel your subscription at any time. Your portal access will remain active until the conclusion of your current paid billing period.`
      },
      lastUpdated: { type: Date, default: Date.now }
    },
    testimonials: {
      type: [testimonialSchema],
      default: () => [
        {
          name: 'Rajesh Kulkarni',
          designation: 'Managing Director',
          company: 'Apex Logistics & Tech',
          rating: 5,
          review:
            'The geofenced mobile attendance and dynamic salary breakup system replaced our entire manual HR burden. Onboarding 120 employees across 3 branches took less than an hour.',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'
        },
        {
          name: 'Pooja Singhania',
          designation: 'VP of Operations',
          company: 'Zenith Retail Solutions',
          rating: 5,
          review:
            'Managing task assignments, daily reporting, and video meetings within one clean dashboard has boosted our team productivity by over 40%. Highly recommended!',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
        },
        {
          name: 'Anand Verma',
          designation: 'Head of Human Resources',
          company: 'Vanguard Systems',
          rating: 5,
          review:
            'The automated PF, ESIC and late deduction rules on monthly salary slips saved our payroll department days of spreadsheets. Absolute game changer.',
          avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80'
        }
      ]
    },
    paymentGateway: {
      razorpayKeyId: { type: String, default: '' },
      razorpayKeySecret: { type: String, default: '' },
      isEnabled: { type: Boolean, default: false },
      currency: { type: String, default: 'INR' }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteContent', siteContentSchema);
