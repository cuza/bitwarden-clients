use std::sync::Arc;

#[cfg(feature = "napi")]
use napi_derive::napi;
use serde::{Deserialize, Serialize};

use crate::{BitwardenError, Callback, WindowDetails};

/// Request for the password or one-time code of a login.
#[cfg_attr(feature = "napi", napi(object, namespace = "autofill"))]
#[cfg_attr(feature = "uniffi", derive(uniffi::Record))]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginCredentialRequest {
    /// The cipher ID of the credential identity the user picked in the OS
    /// suggestions, if any. Without one, the user picks a login in Bitwarden.
    pub record_identifier: Option<String>,

    /// URLs or domains of the website or app asking for the credential.
    pub service_identifiers: Vec<String>,

    /// Whether the OS asked for a one-time code rather than a password.
    pub one_time_code: bool,

    /// Details about the window of the client asking for the credential.
    pub client_window: WindowDetails,

    /// A UUID representing the request, used to cancel it.
    pub context: String,
}

/// The login chosen for a [`LoginCredentialRequest`].
#[cfg_attr(feature = "napi", napi(object, namespace = "autofill"))]
#[cfg_attr(feature = "uniffi", derive(uniffi::Record))]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginCredentialResponse {
    pub username: String,

    /// Set when the request asked for a password.
    pub password: Option<String>,

    /// Set when the request asked for a one-time code.
    pub one_time_code: Option<String>,
}

/// Callback to process a response to a login credential request.
#[cfg_attr(feature = "uniffi", uniffi::export(with_foreign))]
pub trait PrepareLoginCredentialCallback: Send + Sync {
    /// Function to call if a successful response is returned.
    fn on_complete(&self, credential: LoginCredentialResponse);

    /// Function to call if an error response is returned.
    fn on_error(&self, error: BitwardenError);
}

impl Callback for Arc<dyn PrepareLoginCredentialCallback> {
    fn complete(&self, credential: serde_json::Value) -> Result<(), serde_json::Error> {
        let credential = serde_json::from_value(credential)?;
        PrepareLoginCredentialCallback::on_complete(self.as_ref(), credential);
        Ok(())
    }

    fn error(&self, error: BitwardenError) {
        PrepareLoginCredentialCallback::on_error(self.as_ref(), error);
    }
}
