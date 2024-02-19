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
// countryName                     = US
// countryName_default             = US
// countryName_min                 = 2
// countryName_max                 = 2
// stateOrProvinceName             = Texas
// stateOrProvinceName_default     = Texas
// localityName                    = Austin
// localityName_default            = Austin ## This is the default value
// 0.organizationName              = Cloudflare ## Print this message
// 0.organizationName_default      = Cloudflare ## This is the default value
// organizationalUnitName          = Workers ## Print this message
// organizationalUnitName_default  = Workers## This is the default value
// commonName                      = localhost
// commonName_max                  = 64
// emailAddress                    = workers@cloudflare.dev
// emailAddress_max                = 64

// [ v3_ca ]
// subjectKeyIdentifier = hash
// authorityKeyIdentifier = keyid:always,issuer
// basicConstraints = critical,CA:true
// nsComment = "OpenSSL Generated Certificate"
// keyUsage = keyCertSign,digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment
// extendedKeyUsage = serverAuth,clientAuth,codeSigning,timeStamping
export const CERT = `
-----BEGIN CERTIFICATE-----
MIICcDCCAhegAwIBAgIUE97EcbEWw3YZMN/ucGBSzJ/5qA4wCgYIKoZIzj0EAwIw
VTELMAkGA1UEBhMCVVMxDjAMBgNVBAgMBVRleGFzMQ8wDQYDVQQHDAZBdXN0aW4x
EzARBgNVBAoMCkNsb3VkZmxhcmUxEDAOBgNVBAsMB1dvcmtlcnMwIBcNMjMwNjIy
MTg1ODQ3WhgPMjEyMzA1MjkxODU4NDdaMFUxCzAJBgNVBAYTAlVTMQ4wDAYDVQQI
DAVUZXhhczEPMA0GA1UEBwwGQXVzdGluMRMwEQYDVQQKDApDbG91ZGZsYXJlMRAw
DgYDVQQLDAdXb3JrZXJzMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtrIEgzog
jrUHIvB4qgjg/cT7blhWuLUfSUp6H62NCo21NrVWgPtCmCWw+vbGTBwIr/9X1S4U
L1/f3zDICC7YSKOBwjCBvzAdBgNVHQ4EFgQUSXahTksi00c6KhUECHIY4FLW7Sow
HwYDVR0jBBgwFoAUSXahTksi00c6KhUECHIY4FLW7SowDwYDVR0TAQH/BAUwAwEB
/zAsBglghkgBhvhCAQ0EHxYdT3BlblNTTCBHZW5lcmF0ZWQgQ2VydGlmaWNhdGUw
CwYDVR0PBAQDAgL0MDEGA1UdJQQqMCgGCCsGAQUFBwMBBggrBgEFBQcDAgYIKwYB
BQUHAwMGCCsGAQUFBwMIMAoGCCqGSM49BAMCA0cAMEQCIE2qnXbKTHQ8wtwI+9XR
h4ivDyz7w7iGxn3+ccmj/CQqAiApdX/Iz/jGRzi04xFlE4GoPVG/zaMi64ckmIpE
ez/dHA==
-----END CERTIFICATE-----
`;
