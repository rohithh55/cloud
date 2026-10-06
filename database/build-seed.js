// Generates database/migrations/0002_seed.sql from the data below (+ the resume PDF).
// Run:  node database/build-seed.js     then commit the generated file.
// Edit the content here, then add it as a NEW migration (0003_...) or use the /api/admin endpoints for live edits.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "1" : "0") : `'${String(v).replace(/'/g, "''")}'`);
const j = (arr) => q(JSON.stringify(arr));
const out = [];
const insert = (table, row) =>
  out.push(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(q).join(", ")});`);

insert("profile", {
  full_name: "Rohith Reddy",
  title: "DevOps · Cloud · SRE Engineer",
  headline: "I build cloud infrastructure that deploys itself, heals itself, and tells me when it can't.",
  summary: "DevOps, Cloud, and SRE-focused engineer with hands-on experience in AWS, Terraform, Kubernetes, Docker, CI/CD, Linux administration, and monitoring. Owner and operator of DevJops.com, a live production job portal on AWS EKS. Immediate joiner; open to relocation and remote work.",
  about: JSON.stringify([
    "I'm a DevOps, Cloud & SRE engineer based in Bengaluru, focused on infrastructure that is automated, reliable, and observable. I provision AWS with Terraform, ship containers to Amazon EKS, and wire up CI/CD with GitHub Actions and Prometheus/Grafana monitoring.",
    "I don't just build in tutorials — I run DevJops.com, a live production job portal on AWS EKS, and own it end to end: infrastructure, deployments, scaling, DNS, load balancing, monitoring and reliability. Most recently I interned at LeMiCi IQ, automating IaC pipelines with drift detection, security scanning and approval gates.",
    "My philosophy: every deployment should be automated, every failure should be observable, and every incident should leave the system better than it was found."
  ]),
  email: "rohiithh5@gmail.com",
  phone: "+91 93984 31327",
  location: "Bengaluru, India (open to relocation & remote)",
  linkedin: "https://www.linkedin.com/in/rohithreddyhh",
  github: "https://github.com/rohithh55",
  website: "https://rohithh75.netlify.app",
  live_project: "https://devjops.com",
  availability: "Immediate joiner"
});

const exps = [
  { company: "LeMiCi IQ Pvt. Ltd.", role: "DevOps Engineer Intern", location: "Bengaluru, India", start_date: "2026-05-01T00:00:00.000Z", end_date: "2026-08-31T00:00:00.000Z", is_current: 0, sort_order: 1,
    tags: ["Terraform", "IaC", "CI/CD", "Drift Detection", "Security Scanning"],
    bullets: [
      "Assisted in transitioning manual Infrastructure-as-Code (IaC) provisioning into automated deployment pipelines, reducing manual intervention and streamlining execution times.",
      "Configured automated drift detection to monitor deployed infrastructure, helping identify configuration divergences and flag unexpected cloud resources.",
      "Integrated automated security scanning and manual approval gates into the deployment pipeline to catch IaC misconfigurations and authorize production changes before release."
    ] },
  { company: "Accenar Technologies Pvt. Ltd.", role: "DevOps / Cloud Engineering Intern", location: "Hyderabad, India", start_date: "2024-12-01T00:00:00.000Z", end_date: "2025-08-31T00:00:00.000Z", is_current: 0, sort_order: 2,
    tags: ["AWS", "Terraform", "Docker", "ECR", "Linux", "Prometheus", "Grafana", "GitHub Actions"],
    bullets: [
      "Provisioned AWS infrastructure including EC2, S3, VPC, IAM, and ECR using Terraform Infrastructure as Code (IaC).",
      "Containerized applications using Docker; created Dockerfiles and managed image build and push workflows with Amazon ECR.",
      "Administered Linux servers running Ubuntu and CentOS, including user management, SSH key management, cron jobs, and log analysis.",
      "Supported Prometheus and Grafana monitoring for infrastructure visibility and assisted with CI/CD pipeline setup using GitHub Actions."
    ] }
];
for (const e of exps) insert("experiences", { ...e, tags: JSON.stringify(e.tags), bullets: JSON.stringify(e.bullets) });

const projects = [
  { title: "DevJops.com — Production Job Portal", description: "Full-stack React/Node.js job portal running live on Amazon EKS (ap-south-1). I own the whole stack, from Terraform to on-call.", status: "Live", live_url: "https://devjops.com", repo_url: null, sort_order: 1,
    tags: ["AWS EKS", "Terraform", "GitHub Actions", "Prometheus", "Grafana", "React", "Node.js"],
    bullets: [
      "Provisioned VPC, EKS cluster, node groups, S3, IAM and ECR using Terraform.",
      "CI/CD with GitHub Actions: Docker image build → Amazon ECR push → Kubernetes deployment.",
      "Prometheus and Grafana for cluster and application monitoring, alerting and observability.",
      "Managed DNS, load balancing and auto-scaling to keep the app available under real user traffic."
    ] },
  { title: "Self-Healing Kubernetes SRE Project", description: "Python and Bash automation that detects unhealthy Kubernetes pods and triggers remediation, cutting manual recovery effort.", status: "Completed", live_url: null, repo_url: null, sort_order: 2,
    tags: ["Kubernetes", "Python", "Bash", "Prometheus", "Grafana"],
    bullets: ["Detects unhealthy pods and triggers automated remediation.", "Prometheus and Grafana for monitoring, alert visibility and Kubernetes reliability tracking."] },
  { title: "AWS Infrastructure as Code", description: "Reusable Terraform for AWS networking, compute, IAM and container registry — the foundation behind my EKS work.", status: "Completed", live_url: null, repo_url: "https://github.com/rohithh55/aws-infrastructure", sort_order: 3,
    tags: ["Terraform", "AWS", "VPC", "IAM", "ECR"], bullets: [] }
];
for (const p of projects) insert("projects", { ...p, tags: JSON.stringify(p.tags), bullets: JSON.stringify(p.bullets) });

const skills = [
  ["Cloud & Infrastructure", "☁️", ["AWS EC2", "EKS", "ECS", "S3", "ECR", "VPC", "IAM", "Security Groups", "Load Balancing", "Auto Scaling"]],
  ["Infrastructure as Code", "🏗️", ["Terraform", "Drift Detection", "IaC Security Scanning", "Approval Gates"]],
  ["Containers & Orchestration", "🐳", ["Docker", "Kubernetes", "Amazon EKS", "Helm"]],
  ["CI/CD & Automation", "🔄", ["GitHub Actions", "Jenkins (fundamentals)", "Deployment Automation"]],
  ["SRE & Observability", "📊", ["Prometheus", "Grafana", "Alerting", "Incident Troubleshooting", "Root Cause Analysis", "Self-Healing Automation"]],
  ["Systems & Scripting", "⚙️", ["Linux (Ubuntu, CentOS)", "Bash", "Python", "Git", "SSH", "Cron", "Log Analysis"]]
];
skills.forEach(([category, icon, items], i) => insert("skill_groups", { category, icon, items: JSON.stringify(items), sort_order: i + 1 }));

insert("education", { degree: "Bachelor's in Computers", institution: null, graduation_year: 2025, sort_order: 1 });
insert("certifications", { name: "AWS Certified Solutions Architect – Associate", status: "In Progress", issuer: "Amazon Web Services", sort_order: 1 });
insert("certifications", { name: "Certified Kubernetes Administrator (CKA)", status: "In Progress", issuer: "CNCF", sort_order: 2 });

// Resume → files + base64 chunks (kept < 100 KB per SQL statement, D1's limit)
const pdf = path.join(__dirname, "assets", "Rohith_Reddy_Resume.pdf");
if (fs.existsSync(pdf)) {
  const buf = fs.readFileSync(pdf);
  insert("files", { kind: "RESUME", filename: "Rohith_Reddy_Resume.pdf", mime_type: "application/pdf", size_bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), version: 1, is_active: 1 });
  const RAW = 30 * 1024;
  for (let i = 0, n = 0; i < buf.length; i += RAW, n++)
    out.push(`INSERT INTO file_chunks (file_id, idx, data) VALUES ((SELECT id FROM files WHERE kind='RESUME' AND version=1), ${n}, '${buf.subarray(i, i + RAW).toString("base64")}');`);
} else console.warn("database/assets/Rohith_Reddy_Resume.pdf not found — resume not seeded");

fs.writeFileSync(path.join(__dirname, "migrations", "0002_seed.sql"), "-- GENERATED by database/build-seed.js — do not edit by hand\n" + out.join("\n") + "\n");
console.log("Wrote database/migrations/0002_seed.sql (" + out.length + " statements)");
