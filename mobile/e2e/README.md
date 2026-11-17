# End-to-end flows (Maestro)

Run against an installed preview APK on an emulator or a phone with USB debugging:

```bash
maestro test mobile/e2e \
  -e USER_NAME="Test User" -e USER_EMAIL="e2e+$(date +%s)@example.com" -e USER_PASSWORD="Str0ngPass!" \
  -e WORKSPACE_NAME="E2E" -e COMPANY_NAME="E2E Co" -e BILL_NAME="E2E bill" -e BILL_AMOUNT="12.50"
```

Use a staging backend: the flows create a real account. Status: written, **not yet run** (no emulator or Maestro on
the build machine). Some button labels ("Continue", "Save", "Save payment", "Payment recorded") may need adjusting on
the first run.
