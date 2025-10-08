// Generated via
// openssl ecparam -name prime256v1 -genkey -noout -out key.pem
//
// We have to break up the key like this due to gitguardian flagging this as an exposed secret
// Gitguardian should allow us to ignore this via configuration but there's a bug preventing us from properly ignoring this file (https://github.com/GitGuardian/ggshield/issues/548)
export const KEY =
	`
-----BEGIN EC` +
	` PRIVATE KEY-----
MHcCAQEEIC+umA` +
	`aVUbEfPqGA9M7b5zAP7tN2eLT1bu8U8gpbaKbsoAoGCCqGSM49
AwEHoUQDQgAEtrIEgzogjrUHIvB4qgjg/cT7blhWuLUfSUp6H62NCo21NrVWgPtC
mCWw+vbGTBwIr/9X1S4UL1/f3zDICC7YSA==
-----END EC` +
	` PRIVATE KEY-----
`;

// Genereated via
// openssl req -new -x509 -days 36500 -config openssl.cnf  -key key.pem -out cert.pem
//
// openssl.cnf
// [ req ]
// distinguished_name = req_distinguished_name
// policy             = policy_match
// x509_extensions     = v3_ca

// # For the CA policy
// [ policy_match ]
// countryName             = optional
// stateOrProvinceName     = optional
// organizationName        = optional
// organizationalUnitName  = optional
// commonName              = supplied
// emailAddress            = optional

// [ req_distinguished_name ]
// countryName                     = Country Name
// countryName_default             = US
// countryName_min                 = 2
// countryName_max                 = 2
// stateOrProvinceName             = State or Province Name
// stateOrProvinceName_default     = Texas
// localityName                    = Locality
// localityName_default            = Austin
// 0.organizationName              = Organization Name
// 0.organizationName_default      = Cloudflare
// organizationalUnitName          = Organizational Unit Name
// organizationalUnitName_default  = Workers
// commonName                      = Common Name
// commonName_max                  = 64
// emailAddress                    = Email Address
// emailAddress_max                = 64

// [ v3_ca ]
// subjectKeyIdentifier = hash
// authorityKeyIdentifier = keyid:always,issuer
// basicConstraints = critical,CA:true
// nsComment = "OpenSSL Generated Certificate"
// keyUsage = keyCertSign,digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment
// extendedKeyUsage = serverAuth,clientAuth,codeSigning,timeStamping
// subjectAltName = @alt_names

// [alt_names]
// DNS.0 = localhost
// IP.1 = 127.0.0.1

// Interactive answers:
// Country Name [US]:
// State or Province Name [Texas]:
// Locality [Austin]:
// Organization Name [Cloudflare]:
// Organizational Unit Name [Workers]:
// Common Name []:localhost
// Email Address []:wrangler@cloudflare.com
export const CERT = `
-----BEGIN CERTIFICATE-----
MIIDBzCCAq2gAwIBAgIUaEibZTawMcz6xQ/0rGNlEBKwkUowCgYIKoZIzj0EAwIw
gZExCzAJBgNVBAYTAlVTMQ4wDAYDVQQIDAVUZXhhczEPMA0GA1UEBwwGQXVzdGlu
MRMwEQYDVQQKDApDbG91ZGZsYXJlMRAwDgYDVQQLDAdXb3JrZXJzMRIwEAYDVQQD
DAlsb2NhbGhvc3QxJjAkBgkqhkiG9w0BCQEWF3dyYW5nbGVyQGNsb3VkZmxhcmUu
Y29tMCAXDTI1MTAwMjEzMzQ1MloYDzIxMjUwOTA4MTMzNDUyWjCBkTELMAkGA1UE
BhMCVVMxDjAMBgNVBAgMBVRleGFzMQ8wDQYDVQQHDAZBdXN0aW4xEzARBgNVBAoM
CkNsb3VkZmxhcmUxEDAOBgNVBAsMB1dvcmtlcnMxEjAQBgNVBAMMCWxvY2FsaG9z
dDEmMCQGCSqGSIb3DQEJARYXd3JhbmdsZXJAY2xvdWRmbGFyZS5jb20wWTATBgcq
hkjOPQIBBggqhkjOPQMBBwNCAAS2sgSDOiCOtQci8HiqCOD9xPtuWFa4tR9JSnof
rY0KjbU2tVaA+0KYJbD69sZMHAiv/1fVLhQvX9/fMMgILthIo4HeMIHbMB0GA1Ud
DgQWBBRJdqFOSyLTRzoqFQQIchjgUtbtKjAfBgNVHSMEGDAWgBRJdqFOSyLTRzoq
FQQIchjgUtbtKjAPBgNVHRMBAf8EBTADAQH/MCwGCWCGSAGG+EIBDQQfFh1PcGVu
U1NMIEdlbmVyYXRlZCBDZXJ0aWZpY2F0ZTALBgNVHQ8EBAMCAvQwMQYDVR0lBCow
KAYIKwYBBQUHAwEGCCsGAQUFBwMCBggrBgEFBQcDAwYIKwYBBQUHAwgwGgYDVR0R
BBMwEYIJbG9jYWxob3N0hwR/AAABMAoGCCqGSM49BAMCA0gAMEUCIQDNxEiZc6Q6
8hK0q3y/9lDWc+dHr74gAnBHVJZEo5uyRQIgW6eL31hH7qouqUi9+efWU1N85n0z
X3kip4YDAFo8ozE=
-----END CERTIFICATE-----
`;
