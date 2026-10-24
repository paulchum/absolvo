import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { dataDir } from "../env";

export interface PassCertificates { wwdr: string; signerCert: string; signerKey: string; signerKeyPassphrase?: string; development: boolean }

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKey: forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs1", format: "pem" }).toString()),
    publicKey: forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }).toString())
  };
}

function certificate(subject: forge.pki.CertificateField[], issuer: forge.pki.CertificateField[], publicKey: forge.pki.PublicKey, signer: forge.pki.PrivateKey, serial: string, ca: boolean) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = serial;
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 86_400_000);
  cert.setSubject(subject);
  cert.setIssuer(issuer);
  cert.setExtensions(ca ? [{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, cRLSign: true }] : [{ name: "basicConstraints", cA: false }, { name: "keyUsage", digitalSignature: true }]);
  cert.sign(signer as forge.pki.rsa.PrivateKey, forge.md.sha256.create());
  return cert;
}

/**
 * A local CA standing in for Apple's WWDR. Passes it signs are structurally valid and verify
 * against this CA with openssl, but iPhones will never install them.
 */
export function developmentCertificates(passTypeId: string): PassCertificates {
  const dir = path.join(dataDir(), "dev-pass");
  const files = { ca: path.join(dir, "ca.pem"), cert: path.join(dir, "signer.pem"), key: path.join(dir, "signer-key.pem") };
  if (!fs.existsSync(/*turbopackIgnore: true*/ files.key)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const caKeys = keyPair(), signerKeys = keyPair();
    const caName = [{ name: "commonName", value: "Absolvo Development WWDR (not Apple)" }, { name: "organizationName", value: "Absolvo" }];
    const ca = certificate(caName, caName, caKeys.publicKey, caKeys.privateKey, "01", true);
    const signer = certificate([{ name: "commonName", value: `Pass Type ID: ${passTypeId}` }, { name: "organizationalUnitName", value: "ABSOLVODEV" }, { name: "organizationName", value: "Absolvo Development" }], caName, signerKeys.publicKey, caKeys.privateKey, "02", false);
    fs.writeFileSync(files.ca, forge.pki.certificateToPem(ca), { mode: 0o600 });
    fs.writeFileSync(files.cert, forge.pki.certificateToPem(signer), { mode: 0o600 });
    fs.writeFileSync(files.key, forge.pki.privateKeyToPem(signerKeys.privateKey), { mode: 0o600 });
  }
  return { wwdr: fs.readFileSync(/*turbopackIgnore: true*/ files.ca, "utf8"), signerCert: fs.readFileSync(/*turbopackIgnore: true*/ files.cert, "utf8"), signerKey: fs.readFileSync(/*turbopackIgnore: true*/ files.key, "utf8"), development: true };
}

export function developmentCaPath() { return path.join(dataDir(), "dev-pass", "ca.pem"); }
