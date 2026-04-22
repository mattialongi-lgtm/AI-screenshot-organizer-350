# Weekly Digest Automation

This repo now includes a minimal weekly digest demo connected to the ScreenSort product model.

## Why it belongs in this project

The digest uses the same analysis outputs that ScreenSort already produces:
- screenshot categories
- summaries
- extracted entities such as amounts, dates, URLs, and order IDs
- rediscovery logic based on previously analyzed screenshots

That means the digest is not a separate concept. It is a retention layer built on top of the existing screenshot analysis pipeline.

## Demo flow

1. Read sample ScreenSort-shaped screenshot analysis data
2. Count weekly screenshots and categories
3. Aggregate extracted entities
4. Calculate a receipt insight total
5. Select a rediscovery item
6. Render a digest payload ready for email or UI preview

## Run it

```bash
npm run digest:demo
```

## Output

The script writes:

`agent/output/weekly-digest-demo-output.json`

This output can be used as assignment evidence that the weekly digest automation is connected to the actual ScreenSort codebase and data model.
