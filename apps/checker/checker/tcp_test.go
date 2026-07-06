package checker_test

import (
	"testing"

	"github.com/openstatushq/openstatus/apps/checker/checker"
)

func TestPingTcp(t *testing.T) {
	type args struct {
		url     string
		timeout int
	}
	tests := []struct {
		name    string
		args    args
		wantErr bool
	}{
		{name: "will fail", args: args{url: "error:80", timeout: 1}, wantErr: true},
		{name: "will be ok", args: args{url: "openstat.us:443", timeout: 60}, wantErr: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := checker.PingTCP(tt.args.timeout, tt.args.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("PingTcp() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got == nil {
				t.Errorf("PingTcp() = nil")
				return
			}
			if !tt.wantErr {
				if got.Timing.DnsStart == 0 {
					t.Errorf("PingTcp() timing.DnsStart = 0")
				}
				if got.Timing.ConnectDone == 0 {
					t.Errorf("PingTcp() timing.ConnectDone = 0")
				}
			}
		})
	}
}
