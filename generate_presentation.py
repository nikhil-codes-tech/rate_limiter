from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
import os

# Initialize presentation
prs = Presentation()
# Set 16:9 aspect ratio
prs.slide_width = Inches(13.33)
prs.slide_height = Inches(7.5)

# Color scheme
INDIGO = RGBColor(79, 70, 229)
DARK_SLATE = RGBColor(15, 23, 42)
LIGHT_GRAY = RGBColor(241, 245, 249)
WHITE = RGBColor(255, 255, 255)
MUTED = RGBColor(100, 116, 139)

def apply_background(slide, color):
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = color

# -------------------------------------------------------------
# Slide 1: Title
# -------------------------------------------------------------
blank_slide_layout = prs.slide_layouts[6]
slide = prs.slides.add_slide(blank_slide_layout)
apply_background(slide, DARK_SLATE)

# Title Text Box
txBox = slide.shapes.add_textbox(Inches(1), Inches(2.3), Inches(11.33), Inches(3.5))
tf = txBox.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "Distributed Rate Limiter Service"
p.font.size = Pt(44)
p.font.bold = True
p.font.color.rgb = WHITE
p.font.name = 'Arial'

p2 = tf.add_paragraph()
p2.text = "Production-Grade System Design & Cloud Deployment"
p2.font.size = Pt(20)
p2.font.color.rgb = INDIGO
p2.font.name = 'Arial'
p2.space_before = Pt(10)

p3 = tf.add_paragraph()
p3.text = "System Architecture  •  Multi-Tenant Rules  •  Failover Resiliency"
p3.font.size = Pt(14)
p3.font.color.rgb = MUTED
p3.font.name = 'Arial'
p3.space_before = Pt(25)

# -------------------------------------------------------------
# Slide 2: What was Built & Architecture (with Image)
# -------------------------------------------------------------
slide = prs.slides.add_slide(blank_slide_layout)
apply_background(slide, WHITE)

# Title
txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.8))
tf = txBox.text_frame
p = tf.paragraphs[0]
p.text = "What Was Built & Architecture"
p.font.size = Pt(32)
p.font.bold = True
p.font.color.rgb = DARK_SLATE
p.font.name = 'Arial'

# Left Column Text
txBox_left = slide.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(5.8), Inches(5.2))
tf_left = txBox_left.text_frame
tf_left.word_wrap = True

bullets = [
    ("Executive Summary", "A highly concurrent rate-limiting microservice designed for high throughput and sub-millisecond decision latency."),
    ("Multi-Node Clustering", "3 backend application instances running behind Nginx round-robin load-balancing gateway."),
    ("Atomic In-Memory Cache", "Uses Redis Sorted Sets (ZSET) and Lua scripts to perform rolling window updates without race conditions."),
    ("Asynchronous Audit Logs", "PostgreSQL database asynchronously records metadata logs (allowed, remaining, reasons) in the background.")
]

first = True
for title, desc in bullets:
    p_title = tf_left.add_paragraph() if not first else tf_left.paragraphs[0]
    first = False
    p_title.text = f"•  {title}"
    p_title.font.size = Pt(18)
    p_title.font.bold = True
    p_title.font.color.rgb = INDIGO
    p_title.font.name = 'Arial'
    p_title.space_before = Pt(10)
    
    p_desc = tf_left.add_paragraph()
    p_desc.text = f"    {desc}"
    p_desc.font.size = Pt(14)
    p_desc.font.color.rgb = MUTED
    p_desc.font.name = 'Arial'

# Right Column Image
img_path = r"C:\Users\ninan\.gemini\antigravity\brain\a35bf1a2-06fe-4d0b-b2d2-a298922cae5a\architecture_illustration_1784187955726.jpg"
if os.path.exists(img_path):
    slide.shapes.add_picture(img_path, Inches(6.9), Inches(1.8), Inches(5.6), Inches(4.5))

# -------------------------------------------------------------
# Slide 3: Languages & Technologies Used
# -------------------------------------------------------------
slide = prs.slides.add_slide(blank_slide_layout)
apply_background(slide, WHITE)

txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.8))
tf = txBox.text_frame
p = tf.paragraphs[0]
p.text = "Languages & Technologies Used"
p.font.size = Pt(32)
p.font.bold = True
p.font.color.rgb = DARK_SLATE
p.font.name = 'Arial'

txBox_content = slide.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.2))
tf_content = txBox_content.text_frame
tf_content.word_wrap = True

techs = [
    ("JavaScript & Node.js", "Core server runtime language, providing fast event-driven asynchronous execution."),
    ("Express.js Framework", "Provides high-performance HTTP routing for API endpoints and serving static admin dashboard assets."),
    ("Redis Lua Scripting", "Atomic sliding window rate limiting executed directly on the Redis memory engine."),
    ("PostgreSQL Database", "Stores persistent request audit logs using indexed queries to secure analytical tracking."),
    ("HTML5 / Vanilla CSS3", "Admin Dashboard frontend implemented in a sleek responsive Light Theme."),
    ("Prometheus & Grafana", "Telemetry monitoring and visualization of latency percentiles and throughput rates.")
]

first = True
for title, desc in techs:
    p_title = tf_content.add_paragraph() if not first else tf_content.paragraphs[0]
    first = False
    p_title.text = f"•  {title}:  "
    p_title.font.size = Pt(18)
    p_title.font.bold = True
    p_title.font.color.rgb = INDIGO
    p_title.font.name = 'Arial'
    p_title.space_before = Pt(12)
    
    run = p_title.add_run()
    run.text = desc
    run.font.size = Pt(15)
    run.font.bold = False
    run.font.color.rgb = MUTED
    run.font.name = 'Arial'

# -------------------------------------------------------------
# Slide 4: Core Logic & Resiliency
# -------------------------------------------------------------
slide = prs.slides.add_slide(blank_slide_layout)
apply_background(slide, WHITE)

txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.8))
tf = txBox.text_frame
p = tf.paragraphs[0]
p.text = "System Logic & Resiliency"
p.font.size = Pt(32)
p.font.bold = True
p.font.color.rgb = DARK_SLATE
p.font.name = 'Arial'

txBox_content = slide.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.2))
tf_content = txBox_content.text_frame
tf_content.word_wrap = True

logic = [
    ("Sliding Window Algorithm", "Tracks requests using sorted set scores. Automatically discards timestamps outside the window range, checks remaining limits, and updates quotas atomically inside Redis."),
    ("Opossum Circuit Breakers", "Prevents database/caching faults from blocking API gateways. Falls back to a Fail-Open grace-state automatically if Redis gets offline, preserving 99.99% service uptime."),
    ("Safe Startup Concurrency", "Catches schema migration collisions gracefully. If multiple node instances boot simultaneously, database table unique constraint errors are ignored instead of crashing processes."),
    ("Dynamic TLS Upgrades", "Auto-upgrades Redis URLs to rediss:// when connecting to remote cloud environments (like Upstash) for secure transport encrypting.")
]

first = True
for title, desc in logic:
    p_title = tf_content.add_paragraph() if not first else tf_content.paragraphs[0]
    first = False
    p_title.text = f"•  {title}"
    p_title.font.size = Pt(18)
    p_title.font.bold = True
    p_title.font.color.rgb = INDIGO
    p_title.space_before = Pt(12)
    
    p_desc = tf_content.add_paragraph()
    p_desc.text = f"    {desc}"
    p_desc.font.size = Pt(14)
    p_desc.font.color.rgb = MUTED
    p_desc.font.name = 'Arial'

# -------------------------------------------------------------
# Slide 5: Production Cloud Deployment
# -------------------------------------------------------------
slide = prs.slides.add_slide(blank_slide_layout)
apply_background(slide, WHITE)

txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.8))
tf = txBox.text_frame
p = tf.paragraphs[0]
p.text = "Production Cloud Deployment"
p.font.size = Pt(32)
p.font.bold = True
p.font.color.rgb = DARK_SLATE
p.font.name = 'Arial'

txBox_content = slide.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.2))
tf_content = txBox_content.text_frame
tf_content.word_wrap = True

deploy_items = [
    ("Live Serverless Hosting on Vercel", "Deployed Express API endpoints serverlessly at https://rate-limiter-three.vercel.app with automatic routing configuration defined in vercel.json."),
    ("Secure Caching via Upstash Redis", "Handles cluster state globally in Upstash Redis using TLS-encrypted (rediss://) sockets on Vercel."),
    ("Persistent Databases via Supabase Postgres", "Stores request metrics safely in cloud Postgres with SSL encryption keys fully enabled."),
    ("Local Orchestration via Docker Compose", "Includes Dockerfiles, Nginx load balancer configs, Prometheus metrics scapers, and Grafana dashboard panels for simple local cluster deployments.")
]

first = True
for title, desc in deploy_items:
    p_title = tf_content.add_paragraph() if not first else tf_content.paragraphs[0]
    first = False
    p_title.text = f"•  {title}"
    p_title.font.size = Pt(18)
    p_title.font.bold = True
    p_title.font.color.rgb = INDIGO
    p_title.space_before = Pt(12)
    
    p_desc = tf_content.add_paragraph()
    p_desc.text = f"    {desc}"
    p_desc.font.size = Pt(14)
    p_desc.font.color.rgb = MUTED
    p_desc.font.name = 'Arial'

# -------------------------------------------------------------
# Slide 6: Admin Dashboard UI (with Website Screenshot)
# -------------------------------------------------------------
slide = prs.slides.add_slide(blank_slide_layout)
apply_background(slide, WHITE)

txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.8))
tf = txBox.text_frame
p = tf.paragraphs[0]
p.text = "Live Admin Dashboard Interface"
p.font.size = Pt(32)
p.font.bold = True
p.font.color.rgb = DARK_SLATE
p.font.name = 'Arial'

# Left Column Text
txBox_left = slide.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(4.8), Inches(5.2))
tf_left = txBox_left.text_frame
tf_left.word_wrap = True

dashboard_bullets = [
    ("Light Theme Style", "Sleek and responsive light mode styling matching modern premium aesthetics."),
    ("Quota Adjustment Panel", "Enables real-time changes to user tier limits and token bucket configs."),
    ("Cache Flush Button", "Directly removes key counters in Redis to reset user quotas instantly."),
    ("Active Webhooks Log", "Displays active alert listeners and manages Slack/Discord integrations."),
    ("Live Rejection Analytics", "Polls postgres audit entries in real time to show blocked requests.")
]

first = True
for title, desc in dashboard_bullets:
    p_title = tf_left.add_paragraph() if not first else tf_left.paragraphs[0]
    first = False
    p_title.text = f"•  {title}"
    p_title.font.size = Pt(17)
    p_title.font.bold = True
    p_title.font.color.rgb = INDIGO
    p_title.font.name = 'Arial'
    p_title.space_before = Pt(8)
    
    p_desc = tf_left.add_paragraph()
    p_desc.text = f"    {desc}"
    p_desc.font.size = Pt(13)
    p_desc.font.color.rgb = MUTED
    p_desc.font.name = 'Arial'

# Right Column Image (Screenshot from Vercel)
screenshot_path = r"C:\rate limiter\dashboard_screenshot.jpg"
if os.path.exists(screenshot_path):
    slide.shapes.add_picture(screenshot_path, Inches(5.8), Inches(1.5), Inches(6.8), Inches(5.0))

# -------------------------------------------------------------
# Slide 7: How It Can Be Used
# -------------------------------------------------------------
slide = prs.slides.add_slide(blank_slide_layout)
apply_background(slide, WHITE)

txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.8))
tf = txBox.text_frame
p = tf.paragraphs[0]
p.text = "How It Can Be Used"
p.font.size = Pt(32)
p.font.bold = True
p.font.color.rgb = DARK_SLATE
p.font.name = 'Arial'

txBox_content = slide.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.2))
tf_content = txBox_content.text_frame
tf_content.word_wrap = True

use_cases = [
    ("API Security Middleware", "Integrate the POST /api/v1/check-limit route in your API Gateway check path to block DDOS attacks and API abuse."),
    ("Multi-Tenant Tier Billing", "Enforce tier limits automatically (e.g. Free: 10 req/min, Pro: 100 req/min, Enterprise: 1000 req/min) for commercial SaaS platforms."),
    ("Admin Control Dashboard", "Open /dashboard/index.html to dynamically apply user overrides, reset user caches, and register webhook receiver endpoints in real time."),
    ("Instant Cloud Webhook Alerts", "Register webhook URLs (Slack/Discord channels) on the dashboard to trigger instant alerts when a user gets rate-limited.")
]

first = True
for title, desc in use_cases:
    p_title = tf_content.add_paragraph() if not first else tf_content.paragraphs[0]
    first = False
    p_title.text = f"•  {title}"
    p_title.font.size = Pt(18)
    p_title.font.bold = True
    p_title.font.color.rgb = INDIGO
    p_title.space_before = Pt(12)
    
    p_desc = tf_content.add_paragraph()
    p_desc.text = f"    {desc}"
    p_desc.font.size = Pt(14)
    p_desc.font.color.rgb = MUTED
    p_desc.font.name = 'Arial'

# Save presentation
output_path = r"C:\rate limiter\rate_limiter_presentation.pptx"
prs.save(output_path)
print(f"Presentation saved successfully to: {output_path}")
