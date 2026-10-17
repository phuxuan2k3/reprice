// Package apperr là lỗi nghiệp vụ trả về cho client (mã lỗi theo docs/api.md mục 1).
// Package service trả *Error; lớp HTTP đổi sang mã HTTP tương ứng.
package apperr

const (
	BadRequest       = "BAD_REQUEST"
	Unauthenticated  = "UNAUTHENTICATED"
	Forbidden        = "FORBIDDEN"
	NotFound         = "NOT_FOUND"
	InvalidState     = "INVALID_STATE"
	Conflict         = "CONFLICT"
	DeadlinePassed   = "DEADLINE_PASSED"
	ValidationFailed = "VALIDATION_FAILED"
	Internal         = "INTERNAL"
)

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func New(code, message string) *Error { return &Error{Code: code, Message: message} }

// Field là lỗi VALIDATION_FAILED cho một trường.
func Field(field, message string) *Error {
	return &Error{Code: ValidationFailed, Message: message, Details: map[string]any{"fields": map[string]string{field: message}}}
}
