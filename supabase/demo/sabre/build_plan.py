"""Generate the reviewed, local-only SABRE demonstration plan without touching the database."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CATALOG = json.loads((ROOT / 'apps/web/features/briefings/service-catalog.json').read_text())
FORMATS = {item['id']: item for item in CATALOG['formats']}
SERVICES = {item['id']: item for item in CATALOG['types']}
CAMPAIGNS = [
    ('Fresh Start', 'everyday-kit', '2026-01-12', '2026-03-10', 'Small essentials.\nA fresh start.', 'Create a thoughtful everyday routine.', [
        ('Everyday Essentials Launch', 'static-ad', ['feed', 'story'], 'delivered'),
        ('Personal Alarm Product Story', 'social', ['square', 'story'], 'approved'),
        ('New Year Retail Posters', 'print', ['a4', 'a5'], 'delivered'),
        ('Everyday Carry Carousel', 'social', ['square'], 'approved'),
        ('Welcome Email Journey', 'email', ['email'], 'delivered'),
        ('Retail Partner Introduction', 'deck', ['slides'], 'approved'),
    ]),
    ('City Confidence', 'city-confidence', '2026-02-16', '2026-04-03', 'Your city.\nYour rhythm.', 'Bring confidence to everyday moments.', [
        ('City Confidence Paid Social', 'static-ad', ['feed', 'landscape'], 'delivered'),
        ('Morning Commute Stories', 'social', ['story', 'square'], 'approved'),
        ('Community Landing Page', 'web', ['desktop', 'mobile'], 'delivered'),
        ('City Stories Editorial', 'blog', ['article', 'infographic'], 'approved'),
        ('Transit Campaign Posters', 'print', ['letter'], 'delivered'),
        ('Community Newsletter Hero', 'email-hero', ['email-hero'], 'approved'),
    ]),
    ('Move Together', 'run-club', '2026-04-06', '2026-06-12', 'Find your pace.\nTogether.', 'A fresh perspective on your daily movement.', [
        ('Run Club Launch Kit', 'static-ad', ['feed', 'story', 'landscape'], 'approved'),
        ('Saturday Run Motion Reel', 'reel', ['reel'], 'client_review'),
        ('Runner Essentials Guide', 'whitepaper', ['a4'], 'approved'),
        ('Run Club Event Invitations', 'email', ['email'], 'client_review'),
        ('Community Event Signage', 'print', ['a4', 'letter'], 'approved'),
        ('Spring Content Shot List', 'production', ['shot-list', 'custom'], 'client_review'),
    ]),
    ('Weekend Outside', 'weekend-trail', '2026-05-18', '2026-07-24', 'Make room\nfor the outdoors.', 'A little preparation. More room to explore.', [
        ('Trail Weekend Social Series', 'social', ['feed', 'story'], 'changes_requested'),
        ('Outdoor Essentials Landing', 'web', ['desktop', 'mobile'], 'client_review'),
        ('Weekend Packing Checklist', 'blog', ['infographic', 'a4'], 'changes_requested'),
        ('Adventure Partner Deck', 'deck', ['slides'], 'client_review'),
        ('Summer Campaign Art Direction', 'direction', ['direction', 'custom'], 'internal_review'),
    ]),
    ('Campus Connections', 'campus-days', '2026-08-03', '2026-10-16', 'New places.\nNew possibilities.', 'Everyday essentials for a new chapter.', [
        ('Campus Welcome Campaign', 'static-ad', ['feed', 'square', 'story'], 'client_review'),
        ('Student Starter Email', 'email', ['email'], 'changes_requested'),
        ('Campus Ambassador Toolkit', 'deck', ['slides', 'a4'], 'client_review'),
        ('Welcome Week Motion Ad', 'animated-ad', ['reel', 'custom-px'], 'internal_review'),
        ('Campus Event Flyers', 'print', ['a5', 'letter'], 'changes_requested'),
        ('Student Resource Microsite', 'web', ['desktop', 'mobile'], 'in_progress'),
    ]),
    ('Everyday Essentials', 'personal-alarm', '2026-09-07', '2026-11-06', 'Small detail.\nEveryday companion.', 'Designed to go along with your day.', [
        ('Personal Alarm Detail Study', 'static-ad', ['square', 'feed'], 'client_review'),
        ('Product Collection Page', 'web', ['desktop', 'mobile'], 'changes_requested'),
        ('Essentials Product Cards', 'social', ['square', 'story'], 'internal_review'),
        ('Collection Packaging Concept', 'specialty', ['dieline', 'custom-mm'], 'in_progress'),
        ('Product Photography Exploration', 'ai', ['custom-px'], 'in_progress'),
    ]),
    ('Welcome Home', 'home-arrival', '2026-10-05', '2026-12-04', 'The little things\nthat come home.', 'Considered essentials for your daily routine.', [
        ('Homecoming Campaign Launch', 'static-ad', ['feed', 'landscape'], 'internal_review'),
        ('Home Essentials Email', 'email', ['email'], 'in_progress'),
        ('Autumn Brand Guidelines', 'guidelines', ['guidelines', 'slides'], 'internal_review'),
        ('Community Brand Refresh', 'branding', ['brand-kit', 'guidelines'], 'in_progress'),
        ('Home Routine Explainer', 'animated-ad', ['video'], 'client_review'),
    ]),
    ('Thoughtful Giving', 'gift-ready', '2026-11-02', '2026-12-23', 'A little care.\nThoughtfully given.', 'A considered gift for the people in your world.', [
        ('Holiday Gift Guide', 'blog', ['article', 'a4'], 'in_progress'),
        ('Gift Collection Hero', 'email-hero', ['email-hero'], 'internal_review'),
        ('Holiday Social Countdown', 'social', ['feed', 'story', 'square'], 'client_review'),
        ('Gift Box Insert Cards', 'print', ['a5'], 'changes_requested'),
    ]),
]


def deliverable(fmt, index):
    item = FORMATS[fmt]
    width = item.get('width')
    height = item.get('height')
    if fmt in ('custom', 'custom-px'):
        width, height = (1920, 1080) if fmt == 'custom' else (1080, 1080)
    if fmt == 'custom-mm':
        width, height = 210, 297
    if item['layout'] == 'fluid':
        height = {'email': 1500, 'desktop': 1800, 'mobile': 1600, 'article': 1800}[fmt]
    return dict(name=item['name'], format=fmt, width=width, height=height,
                quantity=3 if fmt == 'slides' else 1, scope='original' if index == 0 else 'adaptation')


def build():
    campaigns, projects = [], []
    for ci, (title, image, start, end, headline, body, items) in enumerate(CAMPAIGNS):
        campaigns.append(dict(key=f'campaign-{ci + 1}', title=title, image=image, start=start, end=end,
                              headline=headline, body=body, description=f'A fictional SABRE demonstration campaign: {body}'))
        for title, service, formats, stage in items:
            index = len(projects) + 1
            projects.append(dict(key=f'project-{index:02}', title=title, campaign=ci,
                service=service, credits=SERVICES[service].get('min', 4), stage=stage,
                revision=index % 3 == 0 or stage == 'changes_requested',
                designs=3 if ('Carousel' in title or service == 'deck') else 2 if index % 4 == 0 else 1,
                deliverables=[deliverable(fmt, di) for di, fmt in enumerate(formats)],
                motion=service in ('reel', 'animated-ad'),
                overview=f'Create {title.lower()} for the {campaigns[-1]["title"]} campaign. This is fictional demonstration work for testing the studio workflow.',
                goals='Keep the product easy to recognize, establish a calm visual hierarchy, and adapt the message clearly to each requested format.'))
    return dict(id='sabre-demo-2026-v1', client_slug='sabre', target_projects=50, campaigns=campaigns, projects=projects)


if __name__ == '__main__':
    plan = build()
    assert len(plan['projects']) == 43
    Path(__file__).with_name('plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    print(f'Planned {len(plan["projects"])} new projects in {len(plan["campaigns"])} campaigns.')
