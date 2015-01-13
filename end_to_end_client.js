var pgpContext = new e2e.openpgp.ContextImpl();
var ctxApi = new e2e.ext.api.Api(pgpContext);
pgpContext.setKeyRingPassphrase('');
pgpContext.setArmorHeader(
    'Version',
    'BioMio v1.0');

ctxApi.installApi();
var private_key = '-----BEGIN PGP PRIVATE KEY BLOCK-----\r\n\r\nlQH+BFS1NKABBADgnHDzbVhTa6Sx94RUy66f+3e842atPqad1h/9flL6PIqbuVeU\r\nUaAN8ZFda06rMEkQjyy6z6GVBzlOU/t4pmLQKyRvKY2QnGztAt6UshQ6SLi2k0gr\r\niW1TLBul9PrWZYvlJJFyoVo+Qmel9v2hJ+pwWoy/CFhjtMUP2M9s4M35KQARAQAB\r\n/gMDAlJ0q6+SxWw2YMM9mwhOEsbzn71KTg5PsjDmC/Kr53NQ46+D5xeyG6b4Owt/\r\nHjxjHZ/P+FKmbd68yHcR2uwpM2jZSxux9PTImB24KwlsGwfNV6C+AjCJDCVR1ZaA\r\ndqmxzg1nJUnJ5/vozwsSvIZBgA7l0vmg1cRPCL2eG3e0oIQW9vj0FH/qwwqE+IG1\r\n9aAv83YmgCJkZeAgrcqk4PO6nRUiaS1m9qeLt/nsuf/XkdBPxI3Jktdbjd0aRnBm\r\nTqB2rKnPCwcNzhjv8cHvD+6XNInm5yiBBmbV3SIahM6ijKcy+EVto3ofsCVn6JJ3\r\nvaUBbAW0eVp8guTUw3X+oz6TgtpJRY2X7UumWBEVBtBBFpUZhV0GDrtnWSufzaHm\r\ncdseGZgr8uNBP6k3fdBMZdozYAJ/JhFIRLcPdBhRu6+9h5dfmlyy6qz4K9dZXDnY\r\n6rIuSj79ZEPtNWw+IQqfkpdEl1Oqu30Z6h8VJENA2eeRtCpBdXRvZ2VuZXJhdGVk\r\nIEtleSAoQmlvbWlvKSA8dGVzdEBtYWlsLmNvbT6ItQQTAQIAHwUCVLU0oAIbLwYL\r\nCQgHAwIEFQIIAwMWAgECHgECF4AACgkQP2cVxF/c+ltx+AQAnu76N6ZH6Tp29pl8\r\ncyAmayG5ME4Ljdbq5ZkDoaXJ/h0yjR+mqi2wsVDKenEHH24CFlQ9UqWTmje8LAN5\r\nJAKFno0E9OarGF2+apdLoHEk8Hpv3ea9dgysUl6xcl+BrjfI5d/oW0veHkVgTFrr\r\nHZxmJGCyJJhEqbtVV2ViLMYieF0=\r\n=0ojh\r\n-----END PGP PRIVATE KEY BLOCK-----\r\n';
var pass_phrase = 'snlplY7EdLJJHUiy';
console.log(pgpContext.importKey(function(){return pass_phrase}, private_key, pass_phrase));