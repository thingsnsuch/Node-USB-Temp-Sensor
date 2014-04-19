var usb = require('usb');
var util = require('util');
var buffer = require('buffer');

var currentTemp = 0;
var rawPacket;
var interval = 1000;

var vendorId = 0xC45;
var productId = 0x7401;

//Control transfer 1 - prepare device
var buf1 = new Buffer(8);
buf1.writeUInt8(0x01,0)
buf1.writeUInt8(0x82,1)
buf1.writeUInt8(0x77,2)
buf1.writeUInt8(0x01,3)
buf1.writeUInt8(0x00,4)
buf1.writeUInt8(0x00,5)
buf1.writeUInt8(0x00,6)
buf1.writeUInt8(0x00,7)

//Control transfer 2 - prepare device
var buf2 = new Buffer(8);
buf2.writeUInt8(0x01,0)
buf2.writeUInt8(0x86,1)
buf2.writeUInt8(0xFF,2)
buf2.writeUInt8(0x01,3)
buf2.writeUInt8(0x00,4)
buf2.writeUInt8(0x00,5)
buf2.writeUInt8(0x00,6)
buf2.writeUInt8(0x00,7)

//Control transfer 3 - Request value
var buf3 = new Buffer(8);
buf3.writeUInt8(0x01,0)
buf3.writeUInt8(0x80,1)
buf3.writeUInt8(0x33,2)
buf3.writeUInt8(0x01,3)
buf3.writeUInt8(0x00,4)
buf3.writeUInt8(0x00,5)
buf3.writeUInt8(0x00,6)
buf3.writeUInt8(0x00,7)

//Search for usbTempSensor
process.stdout.write("Searching for device 0x"+vendorId.toString(16)+" 9x"+productId.toString(16)+"...");
var usbTempSensor = usb.findByIds(vendorId,productId);

if(usbTempSensor)
{
    console.log(util.format("Found device at bus %d address %d",usbTempSensor.busNumber,usbTempSensor.deviceAddress));
}
else
{
    console.log("Device not found, exiting");
    process.exit();
}

//Open the device
usbTempSensor.open();

//Necessary, has to be first, no data without
//Buf1 and Buf2 can go in any order but one MUST be in the callback of the other
usbTempSensor.controlTransfer(0x21,0x09,0x0200,0x01,buf1, function(err,data)
{
    if(err)
        console.log("Error in opening control transfer:"+err);

    //Won't get any data without this one, 1.4Per1F with
    usbTempSensor.controlTransfer(0x21,0x09,0x0200,0x01,buf2, function(err,data)
    {
        if(err)
            console.log("Error in opening control transfer:"+err);
    });
});

//Get interface
var interface = usbTempSensor.interface(1);

//Gotta claim away from OS (should hear windows disconnect usbTempSensor sound)
interface.claim();

var configurationDescriptor = usbTempSensor.configurationDescriptor;
var deviceDescriptor = usbTempSensor.deviceDescriptor;

var endpoint = interface.endpoints[0];

var timer = setInterval(function()
{
    console.log("Whole temp:"+currentTemp+" Raw data:"+rawPacket);
}, interval);

endpoint.startStream(1, 8);

endpoint.on("data",function(buffer){

    //Whole number portion of temperature is in byte #3 in plain hex
    //Fractional part of temperature is in byte #4 as a proportion of 256
    currentTemp = buffer[2]+(buffer[3]/256);
    rawPacket = buffer;

    //Prepare next reading
    //Has to be buf3 here to get data other than TEMPerlF and 1.4PerlF out
    usbTempSensor.controlTransfer(0x21,0x09,0x0200,0x01,buf3, function(err,data)
    {
        if(err)
        {
            console.log("Error in control transfer after data");
        }
    });
});

endpoint.on("error", function(error)
{
    console.log("Endpoint 2 Error:"+error);
});

endpoint.on("end",function(){
    console.log("Endpoint 2 stream ending");
    endpoint.stopStream();
    usbTempSensor.close();
});

//If there is an error or the process doesn't exit cleanly and release the device,
//it can be necessary to remove the device and plug it back in between runs. Normally
//this is not the case but during testing and before getting it working it was
//necessary to clean up when hitting ctrl-c
process.on('SIGINT', function() {
    console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );

    try{
        endpoint.stopStream();
    }
    catch(e)
    {
        console.log("Some issues stopping stream 2");
    }

    interface.release(function(err)
    {
        console.log("Trying to release interface 1: "+err);
    });

    try{
        usbTempSensor.close();
    }
    catch(e)
    {}

    process.exit( );
});