---
name: Bug report
about: Create a report to help us improve AutoLlama
title: '[BUG] '
labels: ['bug', 'needs-triage']
assignees: ''
---

## Bug Description
A clear and concise description of what the bug is.

## To Reproduce
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior
A clear and concise description of what you expected to happen.

## Actual Behavior
A clear and concise description of what actually happened.

## Screenshots
If applicable, add screenshots to help explain your problem.

## Environment Information
**AutoLlama Version:** [e.g. v2.3.0]
**Operating System:** [e.g. Ubuntu 22.04, macOS Ventura, Windows 11]
**Docker Version:** [e.g. 24.0.2]
**Browser:** [e.g. Chrome 116, Firefox 117] (if applicable)

**Configuration:**
- API Provider: [e.g. OpenAI, Anthropic]
- Database: [e.g. PostgreSQL 15, Qdrant Cloud]
- Processing Mode: [e.g. Contextual embeddings enabled/disabled]

## Error Logs
```
Paste relevant error logs here, if available.
Use `docker compose logs -f autollama-api` to get API logs
Use `docker compose logs -f autollama` to get frontend logs
```

## Additional Context
- Are you using the default configuration or have you made customizations?
- Does this happen with specific document types or all documents?
- Any recent changes to your environment or configuration?

## Checklist
- [ ] I have checked the [existing issues](https://github.com/your-username/autollama/issues) for duplicates
- [ ] I have included all relevant environment information
- [ ] I have provided steps to reproduce the issue
- [ ] I have included error logs (if applicable)
- [ ] I have tested with the latest version of AutoLlama