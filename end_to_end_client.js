//chrome.storage.sync.remove('biomio_private_key', function(){
//    console.log('done');
//});
//chrome.storage.sync.get('biomio_private_key', function(data){
//    console.log(data);
//});
/*
var pgpContext = new e2e.openpgp.ContextImpl();
pgpContext.setKeyRingPassphrase('');
pgpContext.setArmorHeader(
    'Version',
    'BioMio v1.0');
//var private_key = '-----BEGIN PGP PRIVATE KEY BLOCK-----\r\n\r\nlQH+BFS1NKABBADgnHDzbVhTa6Sx94RUy66f+3e842atPqad1h/9flL6PIqbuVeU\r\nUaAN8ZFda06rMEkQjyy6z6GVBzlOU/t4pmLQKyRvKY2QnGztAt6UshQ6SLi2k0gr\r\niW1TLBul9PrWZYvlJJFyoVo+Qmel9v2hJ+pwWoy/CFhjtMUP2M9s4M35KQARAQAB\r\n/gMDAlJ0q6+SxWw2YMM9mwhOEsbzn71KTg5PsjDmC/Kr53NQ46+D5xeyG6b4Owt/\r\nHjxjHZ/P+FKmbd68yHcR2uwpM2jZSxux9PTImB24KwlsGwfNV6C+AjCJDCVR1ZaA\r\ndqmxzg1nJUnJ5/vozwsSvIZBgA7l0vmg1cRPCL2eG3e0oIQW9vj0FH/qwwqE+IG1\r\n9aAv83YmgCJkZeAgrcqk4PO6nRUiaS1m9qeLt/nsuf/XkdBPxI3Jktdbjd0aRnBm\r\nTqB2rKnPCwcNzhjv8cHvD+6XNInm5yiBBmbV3SIahM6ijKcy+EVto3ofsCVn6JJ3\r\nvaUBbAW0eVp8guTUw3X+oz6TgtpJRY2X7UumWBEVBtBBFpUZhV0GDrtnWSufzaHm\r\ncdseGZgr8uNBP6k3fdBMZdozYAJ/JhFIRLcPdBhRu6+9h5dfmlyy6qz4K9dZXDnY\r\n6rIuSj79ZEPtNWw+IQqfkpdEl1Oqu30Z6h8VJENA2eeRtCpBdXRvZ2VuZXJhdGVk\r\nIEtleSAoQmlvbWlvKSA8dGVzdEBtYWlsLmNvbT6ItQQTAQIAHwUCVLU0oAIbLwYL\r\nCQgHAwIEFQIIAwMWAgECHgECF4AACgkQP2cVxF/c+ltx+AQAnu76N6ZH6Tp29pl8\r\ncyAmayG5ME4Ljdbq5ZkDoaXJ/h0yjR+mqi2wsVDKenEHH24CFlQ9UqWTmje8LAN5\r\nJAKFno0E9OarGF2+apdLoHEk8Hpv3ea9dgysUl6xcl+BrjfI5d/oW0veHkVgTFrr\r\nHZxmJGCyJJhEqbtVV2ViLMYieF0=\r\n=0ojh\r\n-----END PGP PRIVATE KEY BLOCK-----\r\n';
//var public_key = '-----BEGIN PGP PUBLIC KEY BLOCK-----\r\n\r\nmI0EVLU0oAEEAOCccPNtWFNrpLH3hFTLrp/7d7zjZq0+pp3WH/1+Uvo8ipu5V5RR\r\noA3xkV1rTqswSRCPLLrPoZUHOU5T+3imYtArJG8pjZCcbO0C3pSyFDpIuLaTSCuJ\r\nbVMsG6X0+tZli+UkkXKhWj5CZ6X2/aEn6nBajL8IWGO0xQ/Yz2zgzfkpABEBAAG0\r\nKkF1dG9nZW5lcmF0ZWQgS2V5IChCaW9taW8pIDx0ZXN0QG1haWwuY29tPoi1BBMB\r\nAgAfBQJUtTSgAhsvBgsJCAcDAgQVAggDAxYCAQIeAQIXgAAKCRA/ZxXEX9z6W3H4\r\nBACe7vo3pkfpOnb2mXxzICZrIbkwTguN1urlmQOhpcn+HTKNH6aqLbCxUMp6cQcf\r\nbgIWVD1SpZOaN7wsA3kkAoWejQT05qsYXb5ql0ugcSTwem/d5r12DKxSXrFyX4Gu\r\nN8jl3+hbS94eRWBMWusdnGYkYLIkmESpu1VXZWIsxiJ4XQ==\r\n=cwXV\r\n-----END PGP PUBLIC KEY BLOCK-----\r\n';
//var pass_phrase = 'snlplY7EdLJJHUiy';
var uid = 'Autogenerated Key (Biomio) <test@mail.com>';
//console.log(pgpContext.importKey(function(){return null}, private_key, pass_phrase));
//console.log(pgpContext.importKey(function(){return null}, public_key, pass_phrase));
var keys = pgpContext.searchPublicKey(uid);
//keys = keys[0];
console.log(keys.result_);
var private_sign_key = pgpContext.searchPrivateKey(uid);
private_sign_key = private_sign_key.result_[0];
console.log(private_sign_key);
var encrypted_text = pgpContext.encryptSign('test', [], keys.result_, [], private_sign_key);
console.log(encrypted_text.result_);
var decrypted_text = pgpContext.verifyDecrypt(function(){}, encrypted_text.result_);
decrypted_text = e2e.byteArrayToStringAsync(decrypted_text.result_.decrypt.data, decrypted_text.result_.decrypt.options.charset);
console.log(decrypted_text.result_);
//pgpContext.deletePublicKey(uid);
//keys = pgpContext.searchPublicKey(uid);
//console.log(keys.result_);
//private_sign_key = pgpContext.searchPrivateKey(uid);
//private_sign_key = private_sign_key.result_[0];
//console.log(private_sign_key);
//pgpContext.deleteKey('Autogenerated Key (Biomio) <test@mail.com>');
*/
