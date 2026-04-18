// SSL configuration tab (certificate selection, force SSL, HTTP/2, HSTS)
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, AlertTriangle, ShieldCheck, Zap } from "lucide-react";
import type { Certificate } from "@/types";

interface SslTabProps {
  certificateId: number;
  onCertificateIdChange: (id: number) => void;
  sslForced: boolean;
  onSslForcedChange: (val: boolean) => void;
  http2: boolean;
  onHttp2Change: (val: boolean) => void;
  hsts: boolean;
  onHstsChange: (val: boolean) => void;
  hstsSubdomains: boolean;
  onHstsSubdomainsChange: (val: boolean) => void;
  certificates: Certificate[];
  disabled?: boolean;
}

export function SslTab({
  certificateId,
  onCertificateIdChange,
  sslForced,
  onSslForcedChange,
  http2,
  onHttp2Change,
  hsts,
  onHstsChange,
  hstsSubdomains,
  onHstsSubdomainsChange,
  certificates,
  disabled,
}: SslTabProps) {
  const noCert = certificateId === 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>SSL Certificate</Label>
        <Select
          value={String(certificateId)}
          onValueChange={(v) => onCertificateIdChange(Number(v))}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">None</SelectItem>
            {certificates.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.niceName || c.domainNames[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {noCert && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You must select an SSL certificate first to enable any SSL options.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Force SSL
            </Label>
            <p className="text-xs text-muted-foreground">
              Redirect all HTTP traffic to HTTPS
            </p>
            {sslForced && (
              <p className="text-xs text-destructive mt-1">
                Active — all HTTP requests will be redirected to HTTPS.
              </p>
            )}
          </div>
          <Switch
            checked={sslForced}
            onCheckedChange={onSslForcedChange}
            disabled={disabled || noCert}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> HTTP/2 Support
            </Label>
            <p className="text-xs text-muted-foreground">
              Enable HTTP/2 protocol for better performance
            </p>
          </div>
          <Switch
            checked={http2}
            onCheckedChange={onHttp2Change}
            disabled={disabled || noCert}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> HSTS Enabled
            </Label>
            <p className="text-xs text-muted-foreground">
              Force browsers to use HTTPS only (1 year)
            </p>
            {hsts && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Warning: HSTS is hard to reverse. Ensure SSL is working correctly
                before enabling.
              </p>
            )}
          </div>
          <Switch
            checked={hsts}
            onCheckedChange={onHstsChange}
            disabled={disabled || noCert}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>HSTS Subdomains</Label>
            <p className="text-xs text-muted-foreground">
              Include subdomains in HSTS policy
            </p>
          </div>
          <Switch
            checked={hstsSubdomains}
            onCheckedChange={onHstsSubdomainsChange}
            disabled={disabled || noCert || !hsts}
          />
        </div>
      </div>
    </div>
  );
}
